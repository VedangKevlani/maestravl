# Maestravl Travel Intelligence Engine — Architecture

This document explains how the itinerary ingestion, editing, and monitoring
system is put together, and why. It's the map for anyone (human or agent)
picking this up next.

## Pipeline overview

```
Upload (PDF/JPEG/PNG/WEBP)
  → File validation (magic bytes, size, embedded-script check)
  → Encrypt at rest, store outside /public
  → Text extraction (native PDF text, falling back to OCR)
  → Rule-based parser (regex + dictionaries + NLP dates) → confidence-scored fields
  → Normalization → canonical Segment schema
  → Save to DB (Trip, Passenger, Segment, Document, MonitoringRecord)
  → Monitoring adapter registry initializes a (currently unconnected) MonitoringRecord
  → User reviews/edits low-confidence fields in the UI
```

Each stage is an independently swappable module under `lib/`:

| Stage | Location |
|---|---|
| File validation | `lib/security/fileValidation.ts` |
| Encryption at rest | `lib/security/encryption.ts` |
| Native PDF text | `lib/extraction/pdfText.ts` |
| OCR | `lib/extraction/ocr.ts` |
| Extraction orchestration | `lib/extraction/extractText.ts` |
| Entity extraction / parsing | `lib/extraction/parse.ts` |
| Normalization | `lib/extraction/normalize.ts` |
| Monitoring abstraction | `lib/monitoring/` |

## Why no paid AI API

Extraction is built entirely from free, open-source, self-hosted pieces —
no per-request API costs, no rate limits, no third-party data-sharing:

- **`pdfjs-dist`** (Mozilla, Apache-2.0) reads a PDF's native text layer when
  one exists. This is the common case for e-tickets/confirmations and is
  100% accurate — no OCR needed.
- **`tesseract.js`** (Apache-2.0) runs OCR locally (no network calls) when
  there's no text layer — scanned documents, photos of paper tickets,
  screenshots.
- **`chrono-node`** (MIT) parses natural-language dates/times ("Dec 15, 2026
  2:30 PM") into real `Date` objects.
- A hand-written **rule-based entity extractor** (`lib/extraction/parse.ts`)
  finds flight numbers, airport codes, confirmation numbers, seats, gates,
  prices, and passenger names via regex + the airline/airport dictionaries
  in `lib/data/`.

This trades some flexibility (arbitrary phrasing an LLM might catch, this
parser might miss) for zero cost and zero external dependency. If a paid LLM
becomes available later, it slots in as an alternative implementation of the
same `parseItinerary(text) → ExtractedItinerary` contract in
`lib/extraction/parse.ts` — nothing else in the pipeline needs to change.

## Confidence scoring

Every extracted field carries a `{ value, confidence, source }` triple
(`lib/extraction/types.ts`). Confidence is assigned per extraction method:

- Dictionary match (airline/airport code recognized) → 85-95
- Regex match on a labeled field ("Confirmation Number: XJ7K2P") → 78-90
- NLP date parse with both date and time certain → 80
- NLP date parse with only a date → 55
- Heuristic keyword guess (transport type from context) → 30-65

Fields below `CONFIDENCE_REVIEW_THRESHOLD` (70) are surfaced in the editor
UI for the user to confirm. Editing a field via the API
(`PATCH /api/segments/[id]`) removes it from the confidence map entirely —
a user-confirmed value is never second-guessed again.

## Monitoring abstraction

`lib/monitoring/types.ts` defines one interface, `MonitoringAdapter`, that
every transport type implements:

```
MonitoringAdapter
  ├─ flightAdapter   (lib/monitoring/adapters/flightAdapter.ts)
  │    └─ rotates across flight/aviationStack.ts, flight/aeroDataBox.ts —
  │       see "Scheduled monitoring checks" in docs/INTEGRATION.md
  ├─ trainAdapter
  ├─ busAdapter
  ├─ boatAdapter     (covers ferry, cruise, boat)
  └─ taxiAdapter     (covers taxi, rental car)
```

`lib/monitoring/registry.ts` maps a `TransportType` to its adapter. Adding a
new provider or transport mode means writing one adapter and adding it to
the registry — nothing else in the app changes. `flightAdapter` is itself a
small rotator rather than a single provider: free-tier flight-status APIs
cap out too low individually to cover more than a couple of trips a month,
so it spreads checks across every *configured* provider in
`lib/monitoring/adapters/flight/`, tracking spend per provider per calendar
month in the `ProviderUsage` table and falling through to the next provider
once one runs dry (or errors). Adding another provider means writing one
`FlightProviderAdapter` (see `flight/types.ts`) and listing it in
`flightAdapter.ts`'s `PROVIDERS` array.

**Current status: none of these are connected to a live provider.** Each
adapter's `isConfigured()` checks for an environment variable (e.g.
`FLIGHT_MONITORING_API_KEY`); until that's set, `check()` returns
`{ status: 'UNKNOWN', message: '...not connected yet...' }` rather than
fabricating data. See `docs/INTEGRATION.md` for realistic next steps per
transport mode.

## Data model

Status/type fields (`Trip.status`, `Segment.transportType`, `Segment.status`,
`Document.status`, `MonitoringRecord.status`) are plain `String` columns
rather than native Postgres enums, so adding a new value never needs a
migration. The canonical value lists live in `lib/constants.ts` — import
from there rather than hard-coding string literals, and validation happens
via `zod` in the API route handlers (Prisma won't reject an invalid value
on its own).

## Security

- Uploaded files are AES-256-GCM encrypted (`lib/security/encryption.ts`)
  before being uploaded to a *private* Supabase Storage bucket
  (`lib/storage.ts`) — there is no public URL that could ever serve one
  directly. The only way to read a document back is
  `GET /api/documents/[id]/file`, which checks the requesting user owns it,
  then decrypts on the fly.
- File type is verified by magic bytes, not by trusting the client's
  `Content-Type` header or filename extension.
- PDFs containing `/JavaScript`, `/JS`, or `/OpenAction` are rejected
  outright.
- Auth is credential-based (email + bcrypt-hashed password) via Auth.js,
  JWT sessions, no third-party OAuth dependency.
- Every API route re-derives the session server-side and checks resource
  ownership (`trip.userId === session.user.id`) before reading or writing
  anything — there's no client-trusted user id anywhere.

## Agentic recovery (in progress)

The models and logic backing autonomous disruption recovery (spec: a
disrupted segment should trigger Maestravl to work out what's affected and
coordinate a fix, not just email the passenger that something changed).
Built incrementally — this section reflects what's actually implemented,
not the target end-state.

**Data model** (`prisma/schema.prisma`, "Agentic recovery" section):
`Disruption` (a detected status change worth acting on) → `AgentRun` (one
resolution attempt, state-machine `status` from `DETECTED` through
`COMPLETED`) → `AgentAction` (the step-by-step audit log an `AgentRun`
produces — this is also what the passenger-facing recovery timeline will
read from). `ProviderContact`, `Communication`, `RescheduleRequest`, and
`Alternative` round out the workflow: who to contact, what was said, what
new time was requested, and what ranked alternatives exist if the original
can't be recovered.

There is deliberately **no persisted `Dependency` table**. Which segments
are downstream of a disrupted one is fully derivable from each segment's
own `order`/time fields, so it's computed on demand (see below) rather than
stored and risking drift whenever a segment's schedule is edited.

**Dependency/impact engine** (`lib/dependency/graph.ts`): pure,
deterministic logic — no AI, no I/O — matching spec section 17's
instruction to build deterministic tests before adding AI reasoning on top.
Given a trip's segments, which one was disrupted, and a delay in minutes,
`calculateImpact` walks every segment scheduled after it and classifies
each as:

- **DIRECT** — the disruption-shifted timeline conflicts with this
  segment's scheduled start (an outright missed connection).
- **POTENTIAL** — buffer shrinks to within `WARNING_BUFFER_MINUTES` (120,
  tunable) but doesn't break outright.
- **UNAFFECTED** — enough buffer absorbs the shift.

The cascade math mirrors how airlines reason about missed connections: each
segment's *actual* start is `max(its own scheduled start, the previous
segment's actual end)`, and its actual end preserves its own original
duration from there — so a large enough gap anywhere in the chain lets
later segments return to their originally scheduled times rather than
staying perpetually "behind." Segments with missing schedule data are
reported as `POTENTIAL` with a null buffer rather than silently assumed
unaffected (spec section 20: never fake a result you don't have).

**Detection → orchestration pipeline (built):**

```
runMonitoringCheck (lib/monitoring/service.ts)
  → status change? → classifyDisruption (lib/agents/classify.ts)
      → disruptive? → handleDisruptionDetection (lib/agents/detect.ts)
          → creates Disruption row
          → startAgentRun (lib/agents/orchestrator.ts)
              → creates AgentRun (status DETECTED)
              → claims it (DETECTED -> ANALYZING, guards re-entrant calls)
              → planAnalysis (lib/agents/analyze.ts) — pure: runs the
                dependency engine, decides what's affected
              → logs one AgentAction per plan step
              → nothing affected? → AgentRun.status -> COMPLETED
              → something affected? → status -> CONTACTING, then per
                affected segment:
                  → findOrDiscoverContact (lib/agents/contact.ts)
                  → logs FIND_CONTACT
                  → usable email contact? → compose + send a request
                    (lib/agents/message.ts + sendProviderEmail) → logs
                    CONTACT_PROVIDER, creates Communication; a DIRECT
                    impact with a concrete shiftedStart also creates a
                    RescheduleRequest and logs REQUEST_RESCHEDULE
                  → no usable contact? → logs ESCALATE
              → sendDisruptionImpactEmail (one, summarizing every
                affected segment and whether it was actually contacted)
              → AgentRun.status -> WAITING_FOR_RESPONSE | ACTION_REQUIRED
```

`classifyDisruption` filters out routine progression (ON_TIME → BOARDING →
DEPARTED → ARRIVED) and short delays (< `DISRUPTION_DELAY_THRESHOLD_MINUTES`,
30 by default) — those still get the existing plain status-change email,
just no `Disruption`/`AgentRun`.

**Contact discovery** (`lib/agents/contactDiscovery.ts` — pure — wrapped by
`lib/agents/contact.ts` for persistence): per spec section 5, "the
itinerary should be the first source of contact information." First scans
text Maestravl already has — a segment's `notes` and its source document's
`extractedRawText` — for email addresses, URLs, and phone numbers via
regex, scoring confidence higher when a match sits near a keyword like
"contact" or "reservations." Every match is persisted as a
`ProviderContact` (source tagged `ITINERARY` or `BOOKING_CONFIRMATION`)
even at low confidence, for audit purposes — but `isAutoContactable` only
allows automatic contact for an `EMAIL` channel at confidence ≥
`MIN_AUTO_CONTACT_CONFIDENCE` (70). Anything else (a bare phone number, a
low-confidence email, a booking portal URL Maestravl can't submit a form
to) gets recorded and escalated, never acted on.

Only if that local search finds *nothing* — and only if `segment.provider`
is known and `MINIMAX_API_KEY` is configured — does `findOrDiscoverContact`
fall back to a web search via MiniMax's `web_search` Server Tool
(`lib/agents/minimaxSearch.ts`, source tagged `WEB_LOOKUP`). This is the
only one of the team's four existing resources (Boardy, MiniMax,
OllyGarden, Nebius) that turned out to actually offer a search capability
— Boardy is a networking agent, OllyGarden is an observability tool,
Nebius is LLM inference hosting with no search/grounding product found.
MiniMax's is a genuinely paid tool call (reported ~$0.01/request, beta),
not a free-tier API — every other currently-marketed "free" search API was
checked and ruled out as of Aug 2026 (Brave's free tier was discontinued
Feb 2026; Google Custom Search JSON API is closed to new signups). A
segment only ever triggers this once — a discovered contact (or the
confirmed absence of one) is persisted and never re-searched.

Web results get *rescaled* confidence, not trusted at face value —
`discoverContactsInWebResults` only lets a result clear the
auto-contactable threshold if its own domain plausibly matches the
provider's name (a real, if weak, "official source" signal); anything from
an unrelated domain — a booking aggregator mentioning the same email, for
instance — is capped well under `MIN_AUTO_CONTACT_CONFIDENCE` regardless of
how confident the text pattern itself looked, per spec section 5: "do not
use suspicious third-party contact details when an official source is
available."

**Communication** (`lib/agents/message.ts` — pure templates, no LLM, same
philosophy as the rest of this pipeline — sent via `sendProviderEmail` in
`lib/email.ts`, the only real outbound channel this codebase has):
`composeRescheduleRequest` asks for a specific new time (used when the
dependency engine produced a `shiftedStart` — a DIRECT impact from a
delay); `composeAwarenessInquiry` is a softer, non-committal heads-up used
for a POTENTIAL impact or a cancellation's downstream segments, where
there's no single new time to propose. Neither template ever uses
confirmed/changed language — spec section 6: "Messages must NEVER claim
something has been confirmed when it has only been requested."

**Honesty boundary (spec section 20):** an `AgentRun` only reaches
`WAITING_FOR_RESPONSE` when *every* affected segment actually got a
request sent — a real `Communication` row with `status: 'SENT'`, not a
best-effort attempt. If even one affected segment couldn't be contacted
(no usable contact found, or the send failed), the run lands in
`ACTION_REQUIRED` instead, and the passenger email says exactly which
segments Maestravl reached out to and which it couldn't, rather than a
blanket "handled" or "not handled." `COMPLETED` is reserved for the case
where nothing downstream was affected at all.

**Risk policy** (`lib/agents/policy.ts`): every `AgentAction` is classified
LOW/MEDIUM/HIGH via `classifyActionRisk` before it's logged;
`canAutoExecute` gates whether it runs immediately (`EXECUTED`) or stops
for approval (`REQUIRES_APPROVAL`). `CONTACT_PROVIDER`/`REQUEST_RESCHEDULE`
are LOW at baseline (asking isn't committing — spec section 9's LOW list)
but `logAction` accepts an explicit status override so a failed send is
recorded as `FAILED`, not a policy-derived `EXECUTED`, regardless of risk
tier — risk tier and real outcome are tracked separately on purpose. The
MEDIUM/HIGH paths (a reschedule with a fee, a non-refundable cancellation)
are implemented in the policy module but have no caller yet, since nothing
proposes a reschedule *with a fee* until a provider's reply is processed.

**Provider replies** — two paths, both real, neither faked:

- *Manual* (`app/api/agent-runs/[id]/resolve`, the "Heard back?" button in
  `TripRecoveryStatus.tsx`): the passenger tells Maestravl themselves that
  a provider responded (by phone/text/whatever), with an optional note.
  Moves the run straight to `CONFIRMED` — the passenger is asserting
  resolution, not Maestravl inferring it.
- *Automatic* (`lib/agents/inboundReply.ts` + `app/api/webhooks/resend-inbound`,
  opt-in via `RESEND_INBOUND_DOMAIN`/`RESEND_WEBHOOK_SECRET`): every
  provider-facing email's `Reply-To` is a per-`Communication` address
  (`lib/inboundReplyAddress.ts`, `reply+<communicationId>@<inbound-domain>`)
  — Resend has no documented reply-threading headers, so this address *is*
  the correlation mechanism. When a reply lands, the webhook (signature
  verified via `resend.webhooks.verify`, Svix under the hood) fetches the
  full body (`resend.emails.receiving.get` — the webhook payload itself is
  metadata-only), strips the quoted thread history
  (`lib/agents/replyText.ts`, best-effort — catches "On ... wrote:" and
  "> "-quoted blocks, not every client's convention), and records it as an
  inbound `Communication`.

  Deliberately moves the run to `ACTION_REQUIRED`, **not** `CONFIRMED` —
  Maestravl knows a reply arrived, not what it says (no LLM interprets the
  content), so the passenger reads the actual quoted reply themselves
  rather than Maestravl guessing at the outcome. Same honesty boundary as
  everywhere else in this file.

**Alternatives (spec section 8, `rankAlternatives` in
`lib/dependency/graph.ts`):** for a DIRECT impact, Maestravl now proposes
two options rather than one — "Option A" is always the exact `shiftedStart`
(the least disruptive possible ask, since anything later can only match or
worsen downstream impact, never improve it), "Option B" is a 45-minute
safety-margin fallback. Both are persisted as `Alternative` rows (rank 1
selected, rank 2 not) and both get a `downstreamImpact` classification
against whatever segment comes next, computed with the same cascade math
as `calculateImpact` — not a live availability check, since nothing in
this codebase can ask a provider what times they actually have.
`composeRescheduleRequest` folds the backup into the same email as a
second option ("Could you confirm whether either of these times would
work?") rather than sending two separate asks.

**Not yet built:** using a reply's content to actually update the
itinerary (`AgentRun.status` has a `RESCHEDULING` value reserved for this —
nothing produces it yet, since that requires *interpreting* a reply, not
just detecting one), and picking between Option A/B based on which one the
provider actually said yes to (currently nothing reads the reply well
enough to know).

## Passenger-facing recovery status

`TripRecoveryStatus.tsx` (embedded at the top of the trip page) replaced
an earlier version that dumped every `AgentAction` at once — per direct
feedback, that read as a technical log in the middle of an already
stressful situation. Current design:

- A single calm headline derived from `AgentRun.status` via a status→copy
  table (`STATUS_COPY`) — never a raw enum value.
- The single latest action underneath, as a live-feeling ticker (the panel
  polls `GET /api/trips/[id]/activity` every ~12s — no websocket/SSE
  infrastructure in this stack, and polling a handful of trips this
  infrequently is cheap).
- Full history is opt-in behind "View all activity," not shown by default.
  Once opened, only the *most recent* disruption's timeline is expanded —
  earlier disruptions collapse into single summary rows (segment, status,
  update count, relative time) that only expand their own history when
  individually clicked, so a trip with several past disruptions doesn't
  dump everything at once.
- "Heard back?" appears whenever a run is genuinely waiting on someone
  (`WAITING_FOR_RESPONSE`/`ACTION_REQUIRED`) — the manual-resolve escape
  hatch described above.

## Trip archiving

A trip moves to `COMPLETED` (shown in the dashboard's collapsed "Archived
trips" section, `app/(app)/dashboard/page.tsx`) once **every** one of its
segments is finished — `lib/trips/archive.ts`, swept on each monitoring
cron tick rather than triggered by a single segment's status, since most
segment types (hotel, restaurant, taxi, etc.) are never monitored at all
and the sweep has to work without relying on monitoring coverage. A
segment counts as finished once its scheduled end has passed by a 6h
buffer, or it's `CANCELLED`; unknown timing never counts as finished
(never assume completion from missing data).

Monitoring itself also stops promptly on its own — `isMonitoringComplete`
in `lib/monitoring/service.ts` pauses a segment 3h past its *known* arrival
time, or 8h past departure if arrival isn't known, rather than the 24h
window this used to have. That window mattered in practice: a real segment
whose provider (e.g. AeroDataBox) simply has no data for it — a genuine
`noMatch`, not a bug — would otherwise poll every 30 minutes for a full
day past its original departure before giving up.

## Known limitations (by design, for this iteration)

- Extraction is tuned heavily toward flights; train/bus/ferry documents get
  a lower-confidence, less structured pass (see `guessTransportType` in
  `parse.ts`). Extend `TRANSPORT_KEYWORDS` and add mode-specific regexes as
  real documents surface patterns worth encoding.
- The airport/airline dictionaries (`lib/data/`) are curated subsets, not
  exhaustive. They can be swapped for the free/open
  [openflights.org](https://openflights.org/data.html) dataset without
  touching any calling code — `lookupAirport`/`lookupAirline` are the only
  entry points.
- No live monitoring integration yet (see above).
