import { describe, it, expect, beforeAll } from 'vitest'
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib'
import { sanitizeForPdf } from './activityReportPdf'

let font: PDFFont

beforeAll(async () => {
  const doc = await PDFDocument.create()
  font = await doc.embedFont(StandardFonts.Helvetica)
})

describe('sanitizeForPdf', () => {
  it('replaces the route arrow used throughout segmentLabel() with an ASCII-safe equivalent', () => {
    // Confirmed live 2026-08-12: pdf-lib's standard WinAnsi-encoded fonts
    // crash on "→" with "WinAnsi cannot encode" — this is the exact string
    // segmentLabel() produces for every route-based segment.
    expect(sanitizeForPdf('AA1742 (KIN → MIA)', font)).toBe('AA1742 (KIN -> MIA)')
  })

  it('leaves real WinAnsi-encodable typography untouched, even though its code points are >255 (em dash, curly quotes, bullet)', () => {
    // These all measured >255 but genuinely encode fine (WinAnsi/CP1252's
    // special 0x80-0x9F block) — a naive "code point <= 255" cutoff would
    // wrongly "?"-replace every one of these, which real provider/passenger
    // reply text uses constantly.
    expect(sanitizeForPdf('Sent by Maestravl — Request to reschedule', font)).toBe('Sent by Maestravl — Request to reschedule')
    expect(sanitizeForPdf('“Sure, that works,” she said — thanks!', font)).toBe('“Sure, that works,” she said — thanks!')
  })

  it('falls back to "?" for a character the font genuinely cannot encode, rather than throwing', () => {
    expect(sanitizeForPdf('Reply: 👍 looks good', font)).toBe('Reply: ? looks good')
  })

  it('documents why callers MUST split on real newlines before sanitizing, not after: a newline itself is not WinAnsi-encodable and becomes "?" if sanitized directly', () => {
    // Caught live: renderActivityReportPdf originally called
    // sanitizeForPdf(line.text).split('\n') — sanitizing first turned every
    // '\n' into '?' before the split ever ran, so a real multi-paragraph
    // reply rendered as one run-on line littered with stray "?"/"??". The
    // fix splits first, then sanitizes each paragraph. This test pins the
    // underlying reason: sanitizeForPdf alone cannot safely see a raw '\n'.
    expect(sanitizeForPdf('Hello,\n\nBest,\nMaestravl', font)).toBe('Hello,??Best,?Maestravl')
  })
})
