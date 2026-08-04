import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

/**
 * Extracts embedded/native text from a digitally-generated PDF (no OCR).
 * Returns an empty string when the PDF has no text layer (e.g. a scanned
 * document saved as images), so the caller can fall back to OCR.
 */
export async function extractNativePdfText(bytes: Uint8Array): Promise<string> {
  const loadingTask = getDocument({
    data: bytes,
    disableFontFace: true,
    useWorkerFetch: false,
    verbosity: 0,
  })
  const doc = await loadingTask.promise
  try {
    const pageTexts: string[] = []
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum)
      const content = await page.getTextContent()
      const pageText = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
      pageTexts.push(pageText)
    }
    return pageTexts.join('\n\n').trim()
  } finally {
    await loadingTask.destroy()
  }
}

/** Renders each PDF page to a PNG buffer for OCR fallback (scanned/rasterized PDFs). */
export async function renderPdfPagesToPng(bytes: Uint8Array): Promise<Buffer[]> {
  const { createCanvas } = await import('canvas').catch(() => {
    throw new Error(
      'Rendering scanned PDFs to images requires the optional "canvas" package. ' +
      'Install it with `npm install canvas`, or upload the pages as JPEG/PNG images instead.'
    )
  })

  const loadingTask = getDocument({ data: bytes, useWorkerFetch: false, verbosity: 0 })
  const doc = await loadingTask.promise
  try {
    const buffers: Buffer[] = []
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = createCanvas(viewport.width, viewport.height)
      const context = canvas.getContext('2d')
      await page.render({
        // node-canvas's Canvas/2D context are runtime-compatible with the DOM
        // types pdfjs expects, but not structurally identical — cast at the boundary.
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise
      buffers.push(canvas.toBuffer('image/png'))
    }
    return buffers
  } finally {
    await loadingTask.destroy()
  }
}
