import crypto from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_LENGTH = 12

function getKey(): Buffer {
  const hex = process.env.FILE_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('FILE_ENCRYPTION_KEY must be set to a 64-char hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

/** Encrypts a buffer for at-rest storage. Output layout: [iv(12)][authTag(16)][ciphertext]. */
export function encryptBuffer(plaintext: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext])
}

export function decryptBuffer(payload: Buffer): Buffer {
  const iv = payload.subarray(0, IV_LENGTH)
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + 16)
  const ciphertext = payload.subarray(IV_LENGTH + 16)
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

/** Random, non-guessable filename for on-disk storage (never derived from the original filename). */
export function randomStorageFilename(): string {
  return crypto.randomBytes(24).toString('hex') + '.enc'
}
