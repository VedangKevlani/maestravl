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
              → affected segments exist? → sendDisruptionImpactEmail
              → AgentRun.status -> COMPLETED | ACTION_REQUIRED
```

`classifyDisruption` filters out routine progression (ON_TIME → BOARDING →
DEPARTED → ARRIVED) and short delays (< `DISRUPTION_DELAY_THRESHOLD_MINUTES`,
30 by default) — those still get the existing plain status-change email,
just no `Disruption`/`AgentRun`. A genuine delay or cancellation gets both:
the plain status email, and — only if `planAnalysis` finds other segments
actually affected — a second, richer email listing what's threatened and
why (`sendDisruptionImpactEmail` in `lib/email.ts`).

**Honesty boundary (spec section 20):** `AgentRun` only ever reaches
`COMPLETED` when there's genuinely nothing left to do (no downstream
impact found). Any real impact lands the run in `ACTION_REQUIRED` and says
so in the passenger email — Maestravl doesn't have contact-discovery or
provider-communication yet, so it will not claim to have contacted anyone
or requested a change it didn't actually request.

**Risk policy** (`lib/agents/policy.ts`): every `AgentAction` is classified
LOW/MEDIUM/HIGH via `classifyActionRisk` before it's logged;
`canAutoExecute` gates whether it runs immediately (`EXECUTED`) or stops
for approval (`REQUIRES_APPROVAL`). Only `ANALYZE_IMPACT`/`VERIFY`/`ESCALATE`/
`NOTIFY_PASSENGER` actions exist so far, all LOW — the MEDIUM/HIGH paths
(a reschedule with a fee, a non-refundable cancellation) are implemented
in the policy module already but have no caller yet, since nothing
proposes a reschedule until the rescheduling agent exists.

**Not yet built:** contact discovery, the communication agent (only
passenger-facing email exists — nothing provider-facing), the
rescheduling/alternatives agents, and the passenger-facing recovery
timeline UI. `AgentRun.status` also doesn't yet have a `CONTACTING` /
`WAITING_FOR_RESPONSE` / `RESCHEDULING` path — those states exist in the
schema but nothing produces them yet.

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
