// Lays out ActivityReportLine[] (see lib/agents/activityReport.ts, the
// pure/testable half) as an actual PDF using pdf-lib — pure JS, no native
// binary, works in a Vercel serverless function. No parsing/OCR library in
// this codebase (pdfjs-dist, @napi-rs/canvas) can author a new PDF, only
// read/rasterize existing ones — this is the one place that actually
// writes PDF bytes.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { ActivityReportLine, ActivityReportLineStyle } from './activityReport'

const PAGE_WIDTH = 612 // US Letter, points
const PAGE_HEIGHT = 792
const MARGIN = 54
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

const STYLE: Record<ActivityReportLineStyle, { size: number; gapAfter: number; bold: boolean }> = {
  title: { size: 20, gapAfter: 10, bold: true },
  heading: { size: 13, gapAfter: 6, bold: true },
  subheading: { size: 11, gapAfter: 4, bold: true },
  body: { size: 10, gapAfter: 8, bold: false },
  meta: { size: 9, gapAfter: 4, bold: false },
}

// pdf-lib's standard fonts only encode WinAnsi (Windows-1252) — confirmed
// live: "→" (used throughout segmentLabel(), e.g. "AA1742 (KIN → MIA)")
// crashed the whole route with "WinAnsi cannot encode". WinAnsi's encodable
// set is NOT simply "code point <= 255" — it also covers a special 0x80-0x9F
// block mapping to code points well above 255 (em/en dash, curly quotes,
// bullet, trademark, ellipsis all measured >255 but genuinely encode fine —
// confirmed by testing each against the real font below). So rather than
// guess a numeric range, this asks the actual embedded font whether it can
// encode each character and only replaces the ones that genuinely can't
// (arrows, emoji, most non-Latin scripts) — real arrows get a readable
// ASCII equivalent, anything else unanticipated becomes "?" rather than
// crashing the whole PDF on a character nobody foresaw. Communications in
// particular are real, unpredictable provider/passenger reply text, so this
// has to be robust to characters this app's own code never explicitly uses.
const CHAR_REPLACEMENTS: Record<string, string> = {
  '→': '->',
  '←': '<-',
}
export function sanitizeForPdf(text: string, font: PDFFont): string {
  const replaced = text.replace(/[→←]/g, (ch) => CHAR_REPLACEMENTS[ch] ?? ch)
  return Array.from(replaced)
    .map((ch) => {
      try {
        font.widthOfTextAtSize(ch, 10)
        return ch
      } catch {
        return '?'
      }
    })
    .join('')
}

function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const wrapped: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      wrapped.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) wrapped.push(current)
  return wrapped.length > 0 ? wrapped : ['']
}

export async function renderActivityReportPdf(lines: ActivityReportLine[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  function newPage() {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    y = PAGE_HEIGHT - MARGIN
  }

  for (const line of lines) {
    const { size, gapAfter, bold: isBold } = STYLE[line.style]
    const font = isBold ? bold : regular
    // Word-wrap each real paragraph (split on the text's own newlines)
    // independently, rather than collapsing all whitespace first — a
    // Communication's content can carry real line breaks (e.g. an email's
    // paragraphs/signature) that matter for reading it faithfully as
    // plain text, the same fidelity MessageCard.tsx already guarantees
    // on-screen.
    // Split on the RAW text's newlines first, then sanitize each paragraph
    // — sanitizing before splitting would treat '\n' itself as just another
    // unencodable control character and replace it with "?", leaving
    // nothing left to split on (a real bug caught by a live PDF: every line
    // break in a real reply's content rendered as a stray "?").
    const paragraphs = line.text.split('\n').map((p) => sanitizeForPdf(p, regular))
    for (const paragraph of paragraphs) {
      const wrapped = wrapLine(paragraph, font, size, CONTENT_WIDTH)
      for (const chunk of wrapped) {
        if (y - size < MARGIN) newPage()
        page.drawText(chunk, { x: MARGIN, y, size, font, color: rgb(0.1, 0.1, 0.1) })
        y -= size * 1.3
      }
    }
    y -= gapAfter
  }

  return doc.save()
}
