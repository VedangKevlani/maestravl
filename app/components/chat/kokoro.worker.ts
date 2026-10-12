/// <reference lib="webworker" />
// Runs Kokoro TTS (82M params, Apache-2.0) entirely in the user's browser,
// in a worker so synthesis never blocks the page. $0 to run: no server, no
// API key, no per-request cost. One-time download of the model (16-bit for
// WebGPU, ~163 MB; 8-bit for CPU, ~92 MB — useKokoro.ts picks, from
// measurements) plus a ~0.5 MB voice file, both from Hugging Face, kept in
// the browser's Cache Storage afterwards. The ONNX runtime it executes on
// is served from our own origin (scripts/copy-vendor-assets.mjs) rather
// than a third-party CDN.
//
// Protocol (see useKokoro.ts):
//   in:  { type: 'load', device, dtype } | { type: 'speak', id, text } | { type: 'cancel', id }
//   out: { type: 'progress', loaded, total } | { type: 'ready' }
//        | { type: 'audio', id, samples, sampleRate } (one per sentence)
//        | { type: 'done', id } | { type: 'error', id?, message }
import { KokoroTTS, TextSplitterStream, env } from 'kokoro-js'
import { env as transformersEnv } from '@huggingface/transformers'

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'
/** The best-rated Kokoro voice (grade A) — warm, clear American English. */
const VOICE = 'af_heart'
// The same transformers.js instance kokoro-js runs on; the path matches what
// scripts/copy-vendor-assets.mjs copies for that exact version.
env.wasmPaths = `/vendor/transformers-${transformersEnv.version}/`
// Expected console noise: on WebGPU, ONNX Runtime's C++ core logs a benign
// "[W:onnxruntime ...] Some nodes were not assigned to the preferred
// execution providers" (a few small ops run on CPU). It comes from the
// session's own logger, which kokoro-js gives no option to quieten.

const ctx = self as unknown as DedicatedWorkerGlobalScope
export type KokoroDevice = 'wasm' | 'webgpu'
export type KokoroDtype = 'q8' | 'fp16' | 'fp32' | 'q4f16'

let model: Promise<KokoroTTS> | null = null
let config: { device: KokoroDevice; dtype: KokoroDtype } = { device: 'wasm', dtype: 'q8' }
const cancelled = new Set<number>()

function load(): Promise<KokoroTTS> {
  if (!model) {
    const { device, dtype } = config
    // Byte progress across every file the model needs (weights, tokenizer, config).
    const files = new Map<string, { loaded: number; total: number }>()
    model = KokoroTTS.from_pretrained(MODEL_ID, {
      dtype,
      device,
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status !== 'progress' || !p.file) return
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 })
        let loaded = 0
        let total = 0
        for (const f of files.values()) {
          loaded += f.loaded
          total += f.total
        }
        ctx.postMessage({ type: 'progress', loaded, total })
      },
    })
    // Warm up before reporting ready: the first synthesis compiles the GPU
    // shaders (~10s measured on WebGPU) — better spent now, in the
    // background, than in silence before the user's first real reply.
    model = model.then(async (tts) => {
      await tts.generate('Ready.', { voice: VOICE })
      return tts
    })
    model.then(
      () => ctx.postMessage({ type: 'ready' }),
      (err: unknown) => {
        model = null // allow a retry later
        ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    )
  }
  return model
}

async function speak(id: number, text: string) {
  try {
    const tts = await load()
    // Our own splitter, closed explicitly: kokoro's stream(string) never
    // closes the one it creates, so the last sentence can wait forever.
    const splitter = new TextSplitterStream()
    splitter.push(text)
    splitter.close()
    for await (const { audio } of tts.stream(splitter, { voice: VOICE })) {
      if (cancelled.has(id)) break
      const samples = audio.audio as Float32Array
      ctx.postMessage({ type: 'audio', id, samples, sampleRate: audio.sampling_rate }, [samples.buffer])
    }
    ctx.postMessage({ type: 'done', id })
  } catch (err) {
    ctx.postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
  } finally {
    cancelled.delete(id)
  }
}

type InMessage =
  | { type: 'load'; device?: KokoroDevice; dtype?: KokoroDtype }
  | { type: 'speak'; id: number; text: string }
  | { type: 'cancel'; id: number }
  | { type: 'bench'; text: string }

ctx.onmessage = (event: MessageEvent<InMessage>) => {
  const msg = event.data
  if (msg.type === 'load') {
    if (!model && msg.device && msg.dtype) config = { device: msg.device, dtype: msg.dtype }
    void load().catch(() => {})
  } else if (msg.type === 'bench') {
    // Development benchmark: time one full synthesis on the loaded model.
    void load().then(async (tts) => {
      const t0 = performance.now()
      const audio = await tts.generate(msg.text, { voice: VOICE })
      ctx.postMessage({ type: 'bench', ms: performance.now() - t0, seconds: audio.audio.length / audio.sampling_rate, ...config })
    }, (err) => ctx.postMessage({ type: 'bench', error: String(err) }))
  }
  else if (msg.type === 'speak') void speak(msg.id, msg.text)
  else if (msg.type === 'cancel') cancelled.add(msg.id)
}
