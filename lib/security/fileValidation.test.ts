import { describe, it, expect } from 'vitest'
import { detectFileType, validateUploadedFile, MAX_FILE_SIZE_BYTES } from './fileValidation'

function pdfBytes(extra = 'minimal test content padding'): Buffer {
  return Buffer.from(`%PDF-1.4\n${extra}`, 'latin1')
}

describe('detectFileType', () => {
  it('detects PDF from its magic bytes', () => {
    expect(detectFileType(pdfBytes())).toBe('application/pdf')
  })

  it('detects JPEG from its magic bytes', () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(detectFileType(bytes)).toBe('image/jpeg')
  })

  it('detects PNG from its magic bytes', () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    expect(detectFileType(bytes)).toBe('image/png')
  })

  it('detects WEBP from its RIFF/WEBP header', () => {
    const bytes = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP', 'latin1')])
    expect(detectFileType(bytes)).toBe('image/webp')
  })

  it('returns null for an unrecognized/executable file disguised with a random extension', () => {
    // MZ header = Windows PE executable, definitely not a supported document type
    const bytes = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0, 0, 0, 0])
    expect(detectFileType(bytes)).toBeNull()
  })

  it('returns null for a too-short buffer', () => {
    expect(detectFileType(Buffer.from([0x25, 0x50]))).toBeNull()
  })
})

describe('validateUploadedFile', () => {
  it('accepts a well-formed PDF', () => {
    const result = validateUploadedFile(pdfBytes('normal content here'))
    expect(result.ok).toBe(true)
  })

  it('rejects an empty file', () => {
    const result = validateUploadedFile(Buffer.alloc(0))
    expect(result.ok).toBe(false)
  })

  it('rejects a file over the size limit', () => {
    const bytes = Buffer.concat([pdfBytes(), Buffer.alloc(MAX_FILE_SIZE_BYTES)])
    const result = validateUploadedFile(bytes)
    expect(result.ok).toBe(false)
  })

  it('rejects a disguised executable', () => {
    const bytes = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0, 0, 0, 0])
    const result = validateUploadedFile(bytes)
    expect(result.ok).toBe(false)
  })

  it('rejects a PDF containing embedded JavaScript', () => {
    const bytes = pdfBytes('/OpenAction << /S /JavaScript /JS (app.alert("hi")) >>')
    const result = validateUploadedFile(bytes)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/script/i)
  })
})
