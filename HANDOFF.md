# Maestravl — Session Handoff (as of 2026-08-10)

Snapshot for picking this up in a fresh chat. Paste this in, then point the
new session at `docs/ARCHITECTURE.md` (kept up to date throughout this
work) and `AGENTS.md` (the original product spec / non-negotiables) for
full detail — this file is the map, not the territory.

## Non-negotiables (from AGENTS.md — repeat these to any new session)

- **Zero new paid services** beyond the team's existing resources
  (Boardy/MiniMax/OllyGarden/Nebius). Every integration built so far is
  either free-tier-with-no-card or explicitly flagged as paid-but-cheap
  (MiniMax web search, ~$0.01/call, opt-in via env var).
- **Never fake success.** An `AgentRun` only reaches a "done" status when
  something genuinely happened — nothing claims a provider confirmed,
  contacted, or resolved something it didn't actually verify.
- **Deterministic logic first, AI reasoning layered on later.** The
  dependency engine, disruption classifier, and message templates are all
  pure functions with no LLM in the loop — matches the existing repo's
  extraction pipeline philosophy (no paid AI API).

## What's built (Phases 0–8 of the original roadmap)

**Phase 0–2** (pre-existing, not touched this session): itinerary
ingestion (OCR/PDF-text → rule-based parser → confidence scoring), the
generic `Segment` model covering all 15 transport types, flight monitoring
via a 2-provider free-tier rotator (AviationStack + AeroDataBox).

**Phase 3 — Dependency engine** (`lib/dependency/graph.ts`, pure, tested):
`calculateImpact` / `calculateCancellationImpact` classify every downstream
segment as DIRECT/POTENTIAL/UNAFFECTED using connection-cascade math (same
shape as how airlines compute missed-connection risk). `rankAlternatives`
(Phase 8, see below) extends this.

**Phase 4 — Disruption detection + orchestrator** (`lib/agents/classify.ts`,
`detect.ts`, `orchestrator.ts`): a monitored status change that's genuinely
disruptive (delay ≥30min, or any cancellation) creates a `Disruption` row
and starts an `AgentRun` — a resumable state machine
(`DETECTED → ANALYZING → CONTACTING → WAITING_FOR_RESPONSE | ACTION_REQUIRED | COMPLETED`)
that logs every step as an `AgentAction` (the audit trail / activity log).

**Phase 5 — Contact discovery** (`lib/agents/contactDiscovery.ts`,
`contact.ts`): regex-extracts email/phone/URL from a segment's notes and
source document text, confidence-scored by proximity to keywords like
"contact"/"reservations". Falls back to a MiniMax web search (paid,
opt-in via `MINIMAX_API_KEY`) only when nothing local is found — built by
a parallel session, not fully reviewed by me, worth a read-through.

**Phase 6 — Communication** (`lib/agents/message.ts`, `lib/email.ts`,
`lib/agents/inboundReply.ts`, `app/api/webhooks/resend-inbound`): sends
real emails to discovered contacts via Resend, timezone-aware, never
claims confirmation. **Real inbound reply detection** is built — a
per-Communication Reply-To address, a signature-verified webhook, quote
stripping — and moves a run to `ACTION_REQUIRED` (not auto-`CONFIRMED`;
nothing reads *what* a reply says). **Status as of last test: configured
but unverified end-to-end after the last fix** — `RESEND_INBOUND_DOMAIN`
had a malformed value (fixed), and the deployed app was stale until the
big push in this session. Confirm a real reply round-trips before trusting
it.

**Phase 7 — Passenger live status** (`app/components/TripRecoveryStatus.tsx`):
calm live-polling status bar (12s interval, no websocket infra), full
activity log collapsed by default with only the most recent disruption
expanded, older ones collapse to one-line summaries, manual "Heard back?"
resolve action. Also — built outside this session, **not yet documented
in ARCHITECTURE.md** — a full voice assistant (`lib/voice/`,
`app/components/VoiceWidget.tsx`, `app/api/trips/[id]/voice`) answering
questions about the trip using Gemini's free tier + optional ElevenLabs
TTS. Worth reading through if picking this up cold.

**Phase 8 — Alternatives** (`rankAlternatives` in `lib/dependency/graph.ts`):
a DIRECT impact now proposes two options (exact cascade-computed time +
45min safety margin), each scored for downstream impact, persisted as
`Alternative` rows, folded into one provider email ("could you confirm
either of these"). Not a real availability check — nothing here can ask a
provider what times they actually have.

**Bug fixes this session, worth knowing about:**
- Monitoring staleness was 24h flat → now 3h past known arrival / 8h past
  departure (a provider that can never confirm ARRIVED — e.g. AeroDataBox
  has no data for the flight — was polling all day for nothing).
- Trip auto-archive requires **every** segment finished (not just one),
  swept on the cron rather than triggered per-segment, since most segment
  types are never monitored at all.
- New segments default to linking every current trip passenger (both the
  manual-add form and the document-upload path had zero passengers linked
  before).
- "Report a delay" takes an actual new time now, not "minutes late" —
  server computes the delta.

## What's genuinely left (confirmed by reading the code just now, not memory)

- **Train/bus monitoring adapters are still stubs** — `lib/monitoring/adapters/trainAdapter.ts`
  and `busAdapter.ts` just check an env var that's never going to be set to
  anything real; I was mid-research on genuinely free bus/train/rental-car
  APIs when this session got redirected to other work. Worth resuming —
  this was the explicitly stated "next step" before other bugs took
  priority.
- **A provider's reply content is never interpreted.** It's detected,
  stored, and shown to the passenger verbatim — nothing decides "they said
  yes" vs "they said no" or updates the itinerary automatically.
  `AgentRun.status` has a `RESCHEDULING` value reserved for this; nothing
  produces it. This is the natural next big feature and needs a real
  design decision: keyword heuristics (in keeping with "no LLM" so far) or
  finally justify a small LLM call here specifically (the one place in
  this pipeline where genuine language understanding, not classification,
  is the actual job).
- **Alternatives aren't reconciled with replies** — Option A vs Option B
  exist, but nothing picks one based on what the provider actually said,
  for the same reason as above.
- **Inbound reply pipeline needs a live end-to-end verification** (see
  Phase 6 note above) — last known state was "should work, unconfirmed
  after the malformed-env-var fix + stale-deployment fix."
- **Phase 9/10 from the original spec** (deterministic end-to-end demo
  scenario, hardening against duplicate disruptions/race
  conditions/partial failures) — not started. The Jamaica demo scenario
  described in AGENTS.md has never been run end-to-end as a single
  narrative.
- **MiniMax web search integration** — built in this session by a parallel
  process, not reviewed by me. Worth a real code review pass: check it
  respects the "only auto-email if domain plausibly matches provider name"
  claim in its own `.env.example` comment, and that it's actually gated
  correctly behind `MINIMAX_API_KEY`.
- **Voice assistant** — same story, built in parallel, undocumented in
  ARCHITECTURE.md, not reviewed by me.
- Boarding pass QR (BCBP) decoding, wallet export, calendar (.ics) export —
  still just documented as "future ready" in `docs/INTEGRATION.md`, never
  built.

## Current health

- 106/106 tests passing, clean typecheck, as of the last commit
  (`ec11a37`) on `master`, pushed to `origin/master`.
- Everything through Phase 8 is committed and deployed (Vercel
  auto-deploys on push to master — confirm the deploy actually succeeded
  before assuming production matches local).
- `docs/ARCHITECTURE.md` is the authoritative technical reference and was
  kept current through Phase 8 — read it before re-explaining anything
  this file already summarizes.

## Recommended next steps, roughly in priority order

1. Verify the inbound-reply webhook actually works end-to-end in
   production (send a real test disruption, reply as the "provider",
   confirm the status bar updates).
2. Resume the bus/train/rental-car monitoring API research — this was
   explicitly requested and interrupted.
3. Review the MiniMax search and voice assistant code that landed outside
   this session's direct work, and document them in ARCHITECTURE.md.
4. Design and build reply interpretation (RESCHEDULING) — the biggest
   remaining product gap between "detects and shows you a reply" and
   "actually recovers the trip."
5. Run/write the Phase 9 end-to-end demo scenario as a real test, and use
   it to surface Phase 10 hardening gaps (duplicates, races, partial
   failure) rather than guessing at them.
