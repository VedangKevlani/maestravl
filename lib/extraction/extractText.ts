import type { DetectedFileType } from '@/lib/security/fileValidation'
import type { TextExtractionResult } from './types'
import { extractNativePdfText, renderPdfPagesToPng } from './pdfText'
import { runOcr } from './ocr'

/** Below this length, native PDF text is treated as absent (e.g. a scanned PDF with a stray header). */
const MIN_USABLE_NATIVE_TEXT_LENGTH = 40

/**
 * Layered extraction: prefer a PDF's native text layer when present (fast,
 * 100% accurate, free). Only fall back to OCR — slower and imperfect — when
 * there is no usable text layer, or the input is a plain image.
 */
export async function extractText(bytes: Buffer, fileType: DetectedFileType): Promise<TextExtractionResult> {
  if (fileType === 'application/pdf') {
    const nativeText = await extractNativePdfText(bytes).catch(() => '')
    if (nativeText.length >= MIN_USABLE_NATIVE_TEXT_LENGTH) {
      return { text: nativeText, method: 'native-pdf' }
    }
    // No usable text layer — this is likely a scanned/rasterized PDF. Render pages and OCR them.
    const pageImages = await renderPdfPagesToPng(bytes)
    const { text, confidence } = await runOcr(pageImages)
    return { text, method: 'ocr', ocrConfidence: confidence }
  }

  // JPEG / PNG / WEBP: OCR directly
  const { text, confidence } = await runOcr([bytes])
  return { text, method: 'ocr', ocrConfidence: confidence }
}
