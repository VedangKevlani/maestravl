import { createWorker } from 'tesseract.js'

export interface OcrResult {
  text: string
  /** Tesseract's mean confidence for the recognized text, 0-100. */
  confidence: number
}

/**
 * Runs OCR over one or more page images. Free, open-source, runs entirely
 * locally (no external API calls, no per-request cost, no rate limits).
 */
export async function runOcr(imageBuffers: Buffer[]): Promise<OcrResult> {
  const worker = await createWorker('eng')
  try {
    const texts: string[] = []
    const confidences: number[] = []
    for (const buf of imageBuffers) {
      const { data } = await worker.recognize(buf)
      texts.push(data.text)
      confidences.push(data.confidence)
    }
    const avgConfidence = confidences.length
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0
    return { text: texts.join('\n\n').trim(), confidence: avgConfidence }
  } finally {
    await worker.terminate()
  }
}
