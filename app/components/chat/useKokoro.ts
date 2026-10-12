'use client'
// Kokoro TTS for the assistant's spoken replies — main-thread side of
// ./kokoro.worker.ts. One shared worker and AudioContext for the whole app
// (module-level), so the model loads once per page session and playback
// survives the chat popup re-rendering.
//
// Which backend, from measurements (2026-10-12, Edge, Intel integrated GPU,
// a ~5 s sentence):
//   WebGPU, 32-bit (326 MB): ~2.2 s once warm — faster than real time
//   WebGPU, 16-bit (163 MB): ~2.0 s, BUT THE AUDIO IS CORRUPT: peak 1.74
//     (clipping), twice the loudness — heard in production as a loud
//     alarm-like noise. Never use 16-bit; kokoro-js itself recommends
//     32-bit on WebGPU.
//   WebGPU, 8-bit  ( 92 MB): ~11-29 s — quantised ops run poorly on GPU
//   CPU WebAssembly, 8-bit (92 MB): ~5-9 s multi-threaded, ~15 s on one thread
// So: WebGPU + 32-bit where available. Otherwise the CPU build still works
// but is slow enough that the device's own voice is the default there.
//
// Every synthesised chunk is checked before it plays (see isSaneAudio):
// invalid samples, clipping or abnormal loudness mean it is never played —
// the reply falls back to the device voice, and a GPU that produced it is
// remembered as bad in this browser so the CPU build is used from then on.
//
// Never makes the user wait for the one-time download: until Kokoro is
// ready, replies use the device's own voice while it loads in the
// background. Off by default on phones and data-saver connections too
// (it's a large download on a data plan).
import { useEffect, useSyncExternalStore } from 'react'

export type KokoroStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported'
export type VoicePreference = 'natural' | 'device'

export interface KokoroBackend {
  device: 'webgpu' | 'wasm'
  dtype: 'fp32' | 'q8'
  /** Approximate one-time download, for the UI. */
  downloadMb: number
  /** Fast enough to be the default (faster than real time). */
  fast: boolean
}

const PREF_KEY = 'maestravl:voice'
const GPU_BACKEND: KokoroBackend = { device: 'webgpu', dtype: 'fp32', downloadMb: 326, fast: true }
const CPU_BACKEND: KokoroBackend = { device: 'wasm', dtype: 'q8', downloadMb: 92, fast: false }
/** Set when this browser's GPU produced corrupt audio — the CPU build is used from then on. */
const GPU_BAD_KEY = 'maestravl:kokoroGpuBad'

function gpuMarkedBad(): boolean {
  try {
    return localStorage.getItem(GPU_BAD_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Pure — is this synthesised chunk safe to play? Healthy Kokoro output was
 * measured at peak ≈ 0.4-0.65 and RMS ≈ 0.06-0.07; the corrupt 16-bit
 * output was peak 1.74 / RMS 0.12, and worse on other GPUs. Limits leave
 * headroom for natural variation while catching clipping and blasting.
 */
export function isSaneAudio(samples: Float32Array): boolean {
  if (samples.length === 0) return false
  let peak = 0
  let sumSq = 0
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]
    if (!Number.isFinite(v)) return false
    const a = Math.abs(v)
    if (a > peak) peak = a
    sumSq += v * v
  }
  const rms = Math.sqrt(sumSq / samples.length)
  return peak <= 1.0 && rms <= 0.2
}

interface Snapshot {
  status: KokoroStatus
  /** 0..1 while loading. */
  progress: number
  preference: VoicePreference
  backend: KokoroBackend | null
}

let snapshot: Snapshot = { status: 'idle', progress: 0, preference: 'device', backend: null }
let prefLoaded = false
const listeners = new Set<() => void>()
function set(partial: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...partial }
  listeners.forEach((l) => l())
}

let worker: Worker | null = null
let audioCtx: AudioContext | null = null
let nextId = 1
let current: { id: number; sources: AudioBufferSourceNode[]; finish: () => void } | null = null
const handlers = new Map<number, { onAudio: (s: Float32Array, rate: number) => void; onDone: () => void; onError: (m: string) => void }>()

export function isKokoroSupported(): boolean {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined' && typeof AudioContext !== 'undefined'
}

let backendPromise: Promise<KokoroBackend> | null = null
/** WebGPU with 16-bit shader support → the fast GPU build; anything else → the CPU build. */
function detectBackend(): Promise<KokoroBackend> {
  if (!backendPromise) {
    backendPromise = (async () => {
      try {
        const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<{ features: Set<string> } | null> } }).gpu
        const adapter = gpu ? await gpu.requestAdapter() : null
        // 32-bit needs no optional GPU features — any WebGPU adapter will do,
        // unless this browser's GPU already produced corrupt audio.
        return adapter && !gpuMarkedBad() ? GPU_BACKEND : CPU_BACKEND
      } catch {
        return CPU_BACKEND
      }
    })().then((b) => {
      set({ backend: b })
      return b
    })
  }
  return backendPromise
}

async function defaultPreference(): Promise<VoicePreference> {
  if (!isKokoroSupported()) return 'device'
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (conn?.saveData) return 'device'
  // Phones and tablets: a 100+ MB download is a real cost on a data plan — opt-in there.
  if (window.matchMedia?.('(pointer: coarse)').matches) return 'device'
  return (await detectBackend()).fast ? 'natural' : 'device'
}

function loadPreference() {
  if (prefLoaded || typeof window === 'undefined') return
  prefLoaded = true
  if (!isKokoroSupported()) return set({ status: 'unsupported' })
  void detectBackend()
  let stored: string | null = null
  try {
    stored = localStorage.getItem(PREF_KEY)
  } catch {
    /* private mode */
  }
  if (stored === 'natural' || stored === 'device') set({ preference: stored })
  else void defaultPreference().then((preference) => set({ preference }))
}

export function setVoicePreference(preference: VoicePreference) {
  try {
    localStorage.setItem(PREF_KEY, preference)
  } catch {
    /* not remembered — fine */
  }
  set({ preference })
  if (preference === 'natural') preloadKokoro()
  else stopSpeaking()
}

function ensureWorker(): Worker | null {
  if (!isKokoroSupported()) return null
  if (worker) return worker
  worker = new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent) => {
    const msg = event.data as
      | { type: 'progress'; loaded: number; total: number }
      | { type: 'ready' }
      | { type: 'audio'; id: number; samples: Float32Array; sampleRate: number }
      | { type: 'done'; id: number }
      | { type: 'error'; id?: number; message: string }
    if (msg.type === 'progress') set({ status: 'loading', progress: msg.total ? msg.loaded / msg.total : 0 })
    else if (msg.type === 'ready') {
      set({ status: 'ready', progress: 1 })
      recordVoiceDebug({ readyAt: Date.now(), backend: snapshot.backend })
    } else if (msg.type === 'audio') handlers.get(msg.id)?.onAudio(msg.samples, msg.sampleRate)
    else if (msg.type === 'done') handlers.get(msg.id)?.onDone()
    else if (msg.type === 'error') {
      if (msg.id !== undefined) handlers.get(msg.id)?.onError(msg.message)
      else set({ status: 'error' })
      console.warn('[kokoro]', msg.message)
    }
  }
  worker.onerror = (e) => {
    console.warn('[kokoro] worker failed', e.message)
    set({ status: 'error' })
  }
  return worker
}

/** This browser's GPU produced corrupt audio: remember it, drop the GPU model, and use the CPU build from the next reply. */
function abandonGpuBackend() {
  try {
    localStorage.setItem(GPU_BAD_KEY, '1')
  } catch {
    /* can't remember — the safety check still catches it next time */
  }
  console.warn('[kokoro] GPU output failed the safety check; switching to the CPU voice model')
  worker?.terminate()
  worker = null
  backendPromise = null
  set({ status: 'idle', progress: 0, backend: CPU_BACKEND })
  if (snapshot.preference === 'natural') preloadKokoro()
}

/** Starts the one-time model download/initialisation on the best backend (no-op if already loading or ready). */
export function preloadKokoro() {
  if (snapshot.status === 'loading' || snapshot.status === 'ready') return
  const w = ensureWorker()
  if (!w) return set({ status: 'unsupported' })
  set({ status: 'loading', progress: 0 })
  void detectBackend().then((b) => w.postMessage({ type: 'load', device: b.device, dtype: b.dtype }))
}

/**
 * Browsers only allow audio to start from a user gesture — call this from
 * the click/submit that starts a turn, before any await.
 */
export function unlockAudio() {
  if (!isKokoroSupported()) return
  if (!audioCtx) audioCtx = new AudioContext()
  if (audioCtx.state === 'suspended') void audioCtx.resume()
}

export function stopSpeaking() {
  if (!current) return
  worker?.postMessage({ type: 'cancel', id: current.id })
  for (const s of current.sources) {
    try {
      s.stop()
    } catch {
      /* already stopped */
    }
  }
  current.finish()
}

/** True when the next reply should be spoken by Kokoro (wanted, and loaded). */
export function kokoroReady(): boolean {
  return voicePreference() === 'natural' && snapshot.status === 'ready'
}

/**
 * Speaks `text`, playing each sentence as soon as it's synthesised.
 * Resolves when playback ends (or is stopped); rejects if synthesis fails,
 * so the caller can fall back to the device voice.
 */
export function speakWithKokoro(text: string): Promise<void> {
  stopSpeaking()
  const w = ensureWorker()
  if (!w) return Promise.reject(new Error('Kokoro is not supported in this browser'))
  unlockAudio()
  const ctx = audioCtx!
  const id = nextId++
  return new Promise<void>((resolve, reject) => {
    let playhead = 0
    let synthesisDone = false
    let pendingSources = 0
    let settled = false
    const sources: AudioBufferSourceNode[] = []
    const finish = () => {
      if (settled) return
      settled = true
      handlers.delete(id)
      if (current?.id === id) current = null
      resolve()
    }
    current = { id, sources, finish }
    handlers.set(id, {
      onAudio: (samples, rate) => {
        // Never play corrupt output (see isSaneAudio). Stop this reply, let
        // the caller fall back to the device voice, and if the GPU produced
        // it, switch this browser to the CPU build from now on.
        if (!isSaneAudio(samples)) {
          for (const s of sources) {
            try {
              s.stop()
            } catch {
              /* not started yet */
            }
          }
          worker?.postMessage({ type: 'cancel', id })
          recordVoiceDebug({ corruptAudioBlocked: true })
          if (snapshot.backend?.device === 'webgpu') abandonGpuBackend()
          handlers.get(id)?.onError('Synthesised audio failed the safety check — not played')
          return
        }
        if (sources.length === 0) recordVoiceDebug({ firstAudioAt: Date.now(), firstChunkSeconds: samples.length / rate })
        recordVoiceDebug({ chunks: sources.length + 1 })
        const buffer = ctx.createBuffer(1, samples.length, rate)
        buffer.copyToChannel(new Float32Array(samples), 0)
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(ctx.destination)
        // Small lead-in for the first sentence; then back-to-back.
        playhead = Math.max(playhead, ctx.currentTime + 0.05)
        source.start(playhead)
        playhead += buffer.duration
        pendingSources++
        sources.push(source)
        source.onended = () => {
          pendingSources--
          if (synthesisDone && pendingSources === 0) finish()
        }
      },
      onDone: () => {
        synthesisDone = true
        if (pendingSources === 0) finish()
      },
      onError: (message) => {
        if (settled) return
        settled = true
        handlers.delete(id)
        if (current?.id === id) current = null
        reject(new Error(message))
      },
    })
    w.postMessage({ type: 'speak', id, text })
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const SERVER_SNAPSHOT: Snapshot = { status: 'idle', progress: 0, preference: 'device', backend: null }

/** Voice status for UI (preference, download progress). */
export function useKokoro() {
  useEffect(loadPreference, [])
  const state = useSyncExternalStore(subscribe, () => snapshot, () => SERVER_SNAPSHOT)
  return { ...state, approxDownloadMb: state.backend?.downloadMb ?? GPU_BACKEND.downloadMb, slow: state.backend ? !state.backend.fast : false, supported: state.status !== 'unsupported' }
}

/** The current voice preference (loads the saved one on first use). */
export function voicePreference(): VoicePreference {
  loadPreference()
  return snapshot.preference
}

/** Development-only record of what spoke the last reply, for e2e checks (e2e/verify-kokoro.mjs). Never set in production builds. */
export function recordVoiceDebug(partial: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return
  const w = window as unknown as { __maestravlVoice?: Record<string, unknown> }
  w.__maestravlVoice = { ...(w.__maestravlVoice ?? {}), ...partial, status: snapshot.status, preference: snapshot.preference }
}

// Development-only benchmark (e2e/bench-kokoro.mjs): loads a throwaway
// worker with a given device/precision and times synthesis — first run and
// warm. Never installed in production builds.
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  ;(window as unknown as { __kokoroBench?: unknown }).__kokoroBench = (device: string, dtype: string, text: string) =>
    new Promise((resolve) => {
      const w = new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module' })
      const t0 = performance.now()
      const runs: unknown[] = []
      w.onmessage = (e: MessageEvent) => {
        const m = e.data
        if (m.type === 'ready') {
          runs.push({ loadMs: Math.round(performance.now() - t0) })
          w.postMessage({ type: 'bench', text })
        } else if (m.type === 'bench') {
          runs.push(m)
          if (m.error || runs.length >= 3) {
            w.terminate()
            resolve(runs)
          } else w.postMessage({ type: 'bench', text })
        } else if (m.type === 'error') {
          w.terminate()
          resolve([...runs, { error: m.message }])
        }
      }
      w.postMessage({ type: 'load', device, dtype })
    })
}
