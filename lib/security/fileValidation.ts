export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024 // 25MB

export type DetectedFileType = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'

/**
 * Detects the real file type from magic bytes rather than trusting the
 * client-supplied MIME type or filename extension, to prevent a malicious
 * file (e.g. an executable renamed to .pdf) from being processed.
 */
export function detectFileType(bytes: Buffer): DetectedFileType | null {
  if (bytes.length < 12) return null

  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf'

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'

  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (bytes.subarray(0, 8).equals(pngSig)) return 'image/png'

  if (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp'
  }

  return null
}

export type FileValidationResult =
  | { ok: true; type: DetectedFileType }
  | { ok: false; error: string }

export function validateUploadedFile(bytes: Buffer): FileValidationResult {
  if (bytes.length === 0) return { ok: false, error: 'File is empty' }
  if (bytes.length > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: `File exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB limit` }
  }
  const type = detectFileType(bytes)
  if (!type) {
    return { ok: false, error: 'Unsupported or unrecognized file type (allowed: PDF, JPEG, PNG, WEBP)' }
  }
  // PDFs embedding JavaScript are a common attack vector (auto-launch actions,
  // form-submission exfiltration). We only ever read text/render pages from
  // PDFs (never execute them), but reject obviously booby-trapped files outright.
  if (type === 'application/pdf') {
    const sample = bytes.subarray(0, Math.min(bytes.length, 2_000_000)).toString('latin1')
    if (/\/JavaScript\b|\/JS\b|\/OpenAction\b/.test(sample)) {
      return { ok: false, error: 'PDF contains embedded scripts and was rejected' }
    }
  }
  return { ok: true, type }
}
