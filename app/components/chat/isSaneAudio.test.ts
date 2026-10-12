import { describe, it, expect } from 'vitest'
import { isSaneAudio } from './useKokoro'

// A 440 Hz tone at the given amplitude, 0.1 s at 24 kHz (Kokoro's rate).
const tone = (amp: number) => Float32Array.from({ length: 2400 }, (_, i) => amp * Math.sin((2 * Math.PI * 440 * i) / 24000))

describe('isSaneAudio — never play corrupt synthesis', () => {
  it('accepts normal speech levels (measured healthy output: peak ~0.6, RMS ~0.07)', () => {
    // Speech-like: a short loud syllable (peak 0.6) in mostly quieter audio — RMS ~0.15.
    const speech = Float32Array.from(tone(0.6), (v, i) => (i < 240 ? v : v / 6))
    expect(isSaneAudio(speech)).toBe(true)
  })
  it('rejects clipping like the corrupt 16-bit WebGPU output (peak 1.74)', () => {
    expect(isSaneAudio(tone(1.74))).toBe(false)
  })
  it('rejects abnormally loud output even without clipping', () => {
    expect(isSaneAudio(Float32Array.from({ length: 2400 }, (_, i) => (i % 2 ? 0.95 : -0.95)))).toBe(false)
  })
  it('rejects NaN/Infinity and empty chunks', () => {
    const bad = tone(0.5)
    bad[100] = NaN
    expect(isSaneAudio(bad)).toBe(false)
    expect(isSaneAudio(new Float32Array(0))).toBe(false)
  })
})
