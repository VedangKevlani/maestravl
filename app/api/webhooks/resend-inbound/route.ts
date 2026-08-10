import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { fetchReceivedEmail } from '@/lib/email'
import { parseCommunicationIdFromAddress } from '@/lib/inboundReplyAddress'
import { processInboundReply } from '@/lib/agents/inboundReply'

const resend = new Resend(process.env.RESEND_API_KEY)

// Receives Resend's `email.received` webhook — fired when a provider
// replies to a request Maestravl sent on the passenger's behalf (see
// lib/inboundReplyAddress.ts for how the Reply-To address on the way out
// gets matched back to the right conversation on the way in).
//
// Setup (in the Resend dashboard): create a webhook pointing at this
// route's URL, subscribed to `email.received`, and set its signing secret
// as RESEND_WEBHOOK_SECRET. Set RESEND_INBOUND_DOMAIN to whichever
// receiving domain you configure there (a `<id>.resend.app` address needs
// no DNS work; a custom domain needs MX records pointed at Resend).
//
// Signature verification (via Svix, which Resend uses for all webhooks)
// is the only auth on this route — there's no way to also require a
// bearer token on an inbound webhook, so an invalid/missing signature is
// rejected outright rather than trusting the payload.
export async function POST(req: Request) {
  if (!process.env.RESEND_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'RESEND_WEBHOOK_SECRET is not configured' }, { status: 500 })
  }

  // Signature verification needs the exact raw bytes Resend signed — must
  // read as text before any JSON parsing, or the signature won't match.
  const payload = await req.text()
  const headers = {
    id: req.headers.get('svix-id') ?? '',
    timestamp: req.headers.get('svix-timestamp') ?? '',
    signature: req.headers.get('svix-signature') ?? '',
  }

  // verify() both validates the signature and returns the parsed,
  // correctly-typed event — no separate JSON.parse needed, and TypeScript
  // narrows `event.data` once `event.type` is checked below.
  let event
  try {
    event = resend.webhooks.verify({ payload, headers, webhookSecret: process.env.RESEND_WEBHOOK_SECRET })
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type !== 'email.received') {
    // Not an event type we act on — acknowledge so Resend doesn't retry it.
    return NextResponse.json({ ok: true })
  }

  const communicationId = event.data.to.map(parseCommunicationIdFromAddress).find((id): id is string => Boolean(id))

  // Not addressed to one of our reply addresses (e.g. spam hitting the
  // catch-all domain) — nothing to correlate this to.
  if (!communicationId) return NextResponse.json({ ok: true })

  // Webhook payloads only carry metadata (from/to/subject) — the body
  // needs a separate fetch. If that fetch fails, there's nothing honest to
  // record, so this just acknowledges the webhook without fabricating a
  // reply.
  const email = await fetchReceivedEmail(event.data.email_id)
  if (!email) return NextResponse.json({ ok: true })

  const result = await processInboundReply(communicationId, email)
  return NextResponse.json(result)
}
