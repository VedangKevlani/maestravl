import { describe, it, expect, beforeAll } from 'vitest'
import crypto from 'node:crypto'

beforeAll(() => {
  process.env.FILE_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')
})

describe('encryptBuffer / decryptBuffer', () => {
  it('round-trips arbitrary binary data', async () => {
    const { encryptBuffer, decryptBuffer } = await import('./encryption')
    const original = crypto.randomBytes(2048)
    const encrypted = encryptBuffer(original)
    const decrypted = decryptBuffer(encrypted)
    expect(decrypted.equals(original)).toBe(true)
  })

  it('produces ciphertext that does not contain the plaintext', async () => {
    const { encryptBuffer } = await import('./encryption')
    const original = Buffer.from('this is a very secret passport scan payload')
    const encrypted = encryptBuffer(original)
    expect(encrypted.includes(original)).toBe(false)
  })

  it('fails to decrypt with a tampered payload (authentication tag catches it)', async () => {
    const { encryptBuffer, decryptBuffer } = await import('./encryption')
    const encrypted = encryptBuffer(Buffer.from('sensitive data'))
    encrypted[encrypted.length - 1] ^= 0xff // flip a byte in the ciphertext
    expect(() => decryptBuffer(encrypted)).toThrow()
  })

  it('produces different ciphertext for the same plaintext on repeated calls (random IV)', async () => {
    const { encryptBuffer } = await import('./encryption')
    const a = encryptBuffer(Buffer.from('same input'))
    const b = encryptBuffer(Buffer.from('same input'))
    expect(a.equals(b)).toBe(false)
  })
})

describe('randomStorageFilename', () => {
  it('never reflects the original filename and is unique per call', async () => {
    const { randomStorageFilename } = await import('./encryption')
    const a = randomStorageFilename()
    const b = randomStorageFilename()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[0-9a-f]+\.enc$/)
  })
})
