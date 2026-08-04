import { createClient } from '@supabase/supabase-js'

// Documents are encrypted client-side (lib/security/encryption.ts) before
// they ever reach this module, so this is just an opaque-blob store — the
// service role key is safe to use server-side since the bucket is private
// and every route that calls these functions already checked ownership.
const BUCKET = 'documents'

function client() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function uploadDocument(storedFilename: string, encrypted: Buffer): Promise<void> {
  const { error } = await client().storage.from(BUCKET).upload(storedFilename, encrypted, {
    contentType: 'application/octet-stream',
    upsert: false,
  })
  if (error) throw new Error(`Document upload failed: ${error.message}`)
}

export async function downloadDocument(storedFilename: string): Promise<Buffer> {
  const { data, error } = await client().storage.from(BUCKET).download(storedFilename)
  if (error || !data) throw new Error(`Document download failed: ${error?.message ?? 'not found'}`)
  return Buffer.from(await data.arrayBuffer())
}

/** Best-effort delete — callers already treat failures as non-fatal (a trip/document row can still be removed even if the blob cleanup fails). */
export async function deleteDocument(storedFilename: string): Promise<void> {
  await client().storage.from(BUCKET).remove([storedFilename])
}

export async function deleteDocuments(storedFilenames: string[]): Promise<void> {
  if (storedFilenames.length === 0) return
  await client().storage.from(BUCKET).remove(storedFilenames)
}
