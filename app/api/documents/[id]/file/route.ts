import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'
import { decryptBuffer } from '@/lib/security/encryption'
import { downloadDocument } from '@/lib/storage'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id } = await params

  const document = await prisma.document.findUnique({ where: { id } })
  if (!document || document.userId !== auth.userId) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const encrypted = await downloadDocument(document.storedFilename)
  const decrypted = decryptBuffer(encrypted)

  return new NextResponse(new Uint8Array(decrypted), {
    headers: {
      'Content-Type': document.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(document.originalFilename)}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
