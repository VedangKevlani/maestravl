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
  ├─ flightAdapter   (lib/monitoring/adapters/flightAdapter.ts) — real
  │    └─ rotates across flight/aviationStack.ts, flight/aeroDataBox.ts —
  │       see "Scheduled monitoring checks" in docs/INTEGRATION.md
  ├─ trainAdapter    (lib/monitoring/adapters/trainAdapter.ts) — real
  ├─ busAdapter      (lib/monitoring/adapters/busAdapter.ts) — real
  │    └─ both are the transitland/ factory (see below), gtfsRouteType
  │       is the only difference between them
  ├─ boatAdapter     (covers ferry, cruise, boat) — stub
  └─ taxiAdapter     (covers taxi, rental car) — stub
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

**Train/bus (`lib/monitoring/adapters/transitland/`):** backed by
[Transitland](https://transit.land), a free-tier (10,000 REST queries/month)
aggregator of GTFS/GTFS-realtime for 55+ countries — one `TRANSITLAND_API_KEY`
covers both. `createTransitlandAdapter({ id, supports, gtfsRouteType })` in
`transitlandAdapter.ts` is the shared factory; `trainAdapter.ts`/`busAdapter.ts`
are one-line instantiations (`gtfsRouteType: 2` rail / `3` bus, per the GTFS
spec — a best-effort filter, not exhaustive). `check()`: search Transitland
operators for `segment.provider`, search that operator's routes for
`segment.identifier` (both matched via the pure, unit-tested
`pickBestOperatorMatch`/`pickBestRouteMatch` in `matching.ts` — normalized
substring matching that returns `null` rather than guessing a low-confidence
match), then classify the matched route's active GTFS-RT alerts
(`classifyAlerts` — prefers the structured `effect` field, falls back to
text-keyword matching, only fills `delayMinutes` when an explicit figure is
in the alert text, never fabricated). Quota tracked via the same
`ProviderUsage` table/helpers (`flight/usage.ts`) flights already use, under
`provider: 'transitland'`.

The real constraint isn't the API, it's the data: `lib/extraction/parse.ts`
only ever fills `identifier`/`provider` for flight-number-shaped text, so an
auto-extracted TRAIN/BUS segment has both null and the adapter honestly
reports `noMatch` with a message telling the passenger to fill in the
operator + train/bus number (Edit) — real monitoring only starts once a
human does that. This mirrors how AeroDataBox's `noMatch` already works for
a flight the provider simply doesn't carry, extended to a broader "not
enough identifying data yet" case.

**Rental car / taxi / ferry / cruise: still stubs.** Researched this session
— no free, self-serve status API exists for rental cars or taxi dispatch
(Avis/Booking.com/OpenNDC are all partner-agreement-gated); ferry/cruise
operators mostly don't expose public APIs at all. See `docs/INTEGRATION.md`
for what was checked, so it isn't re-researched from scratch later.
`taxiAdapter.ts`/`boatAdapter.ts`'s `isConfigured()` still checks an env var
purely to phrase an honest "not connected" message — there's no real
provider behind either, and `/system-health` reports both as "not
implemented" rather than merely unconfigured.

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

  Never moves straight to `CONFIRMED` — see "Reply interpretation" below
  for what it does move to and why that's still not the same as claiming
  resolution.

**Reply interpretation (`lib/agents/replyInterpretation.ts`):** the one
deliberate exception to this codebase's "deterministic logic first, no LLM
in the loop" rule (see the "Why no paid AI API" section above and the
header comments on `analyze.ts`/`classify.ts`/`message.ts`) — reading what
a reply actually *means* is genuine language understanding, not something
a regex can do, and it reuses the same free-tier Gemini already wired for
the voice assistant rather than adding a new dependency.

Split pure/impure the same way `replyText.ts`/`inboundReply.ts` already
are: `classifyReply` is the only network call (Gemini, structured JSON
output constrained to `ACCEPTED | DECLINED | COUNTER_OFFER | UNCLEAR` plus
a confidence score) and never throws — any failure (no `GEMINI_API_KEY`,
timeout, malformed output) degrades to `UNCLEAR`, exactly the pipeline's
behavior before this feature existed, so a broken classifier can never
make anything worse than not having one. `decideRunTransition` is pure and
unit-tested (`replyInterpretation.test.ts`) — it's what actually decides
the `AgentRun`'s next status, keeping that decision as deterministic and
auditable as the rest of the pipeline; only the reading-comprehension step
is AI.

Even a confident `ACCEPTED` read only reaches `RESCHEDULING`, never
`CONFIRMED` directly — spec section 20, never claim a resolution that
wasn't verified. `RESCHEDULING` surfaces a prompt in
`TripRecoveryStatus.tsx` with the interpreted summary, a link to the real
reply text (via the new `GET /api/agent-runs/[id]/communications`), and
two buttons: "Confirm — update itinerary" or "Not quite — keep working on
it". Only an explicit passenger confirm
(`app/api/agent-runs/[id]/confirm-reschedule`) moves the run to
`CONFIRMED` and actually rewrites the segment's `departureTime`/
`arrivalTime` (shifted by the same delta, so trip duration stays
consistent) — the first and only place a recovery run's own action ever
mutates a segment's scheduled time (`detect.ts`/`monitoring/service.ts`
deliberately never do, layering live status on top instead). That's safe
specifically because it's gated behind the same human-confirmation trust
boundary as the manual segment-edit route, not an agent silently rewriting
the record. This is also `AgentActionType.UPDATE_ITINERARY`'s first real
use anywhere in the codebase — logged once the itinerary is actually
updated. Declining the prompt reverts the run to `ACTION_REQUIRED` with a
note recording the correction — the human always has the final say over a
misread reply.

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

**Not yet built:** picking between Option A/B based on which one the
provider actually said yes to — `classifyReply` reads intent (accepted/
declined/counter-offer), not which specific proposed time was accepted, so
`confirm-reschedule` always applies the primary `RescheduleRequest.requestedTime`
regardless of whether the reply meant Option A or Option B.

## Ground transport suggestion ("Get an Uber there")

`lib/uber.ts` + `app/components/SegmentCard.tsx` — a deep link into Uber's
own app/website with pickup/dropoff prefilled, **not a real booking**.
Investigated actually booking through Uber's API (Riders API / Guest Rides)
first: both are book-and-track — they only know about rides Uber itself
created via the API, so they can't check the status of a ride booked some
other way, which is what monitoring an existing `TAXI`/`RENTAL_CAR` segment
would need. Real in-app booking would also be a materially bigger feature —
an actual fare charged per ride, and this codebase has no payment
infrastructure anywhere — so it's deliberately left as an open product
question rather than built.

The deep link itself (`https://m.uber.com/looking?client_id=...&pickup=...&drop[0]=...`)
needs no Uber API calls and no business approval — just a free `client_id`
from Uber's developer dashboard (creating an app there is unprivileged;
approval is only required for scopes this never uses, like actually
requesting a ride). `isUberConfigured()` checks `NEXT_PUBLIC_UBER_CLIENT_ID`
rather than a server-only var like every other integration in this file —
it has to run in `SegmentCard.tsx`, a client component, and unlike a real
API key the client_id isn't a secret (it's a visible query parameter in the
link itself). `locationText()` builds pickup/dropoff from whatever
free-text location or airport-dictionary lookup is available — Maestravl
has no coordinates for any segment, so the link is built from address text
only, and returns `null` (no button rendered) rather than fabricating a
location.

Shown directly on a `SegmentCard` when that segment's own status is
`DELAYED`/`CANCELLED` and there's a next segment with a resolvable
departure location — pickup is this segment's arrival, dropoff is the next
segment's departure. This is a deliberate simplification: it doesn't
consult the dependency engine's actual impact analysis (`SegmentImpact` /
`plan.affected` in `lib/dependency/graph.ts`/`orchestrator.ts`), which
isn't currently exposed to the client at all (`GET /api/trips/[id]/activity`
only returns `AgentAction.description` prose, not `segmentId`) — a tighter
version scoped to "only during an active AgentRun for this exact
connection" is a natural follow-up once that route exposes structured
segment data instead of just text.

The exact deep-link URL format was read from Uber's own docs page as of
2026-08, but a secondary source referenced a different path
(`m.uber.com/ul/?action=setPickup...`) and neither was confirmed against a
live click-through — no `client_id` was available while building this.
Worth a manual check the first time a real key is set.

## Passenger-facing recovery status

`TripRecoveryStatus.tsx` (embedded at the top of the trip page) replaced
an earlier version that dumped every `AgentAction` at once — per direct
feedback, that read as a technical log in the middle of an already
stressful situation. A later revision found the replacement itself still
led with a *generic* status phrase (from `STATUS_COPY`) rather than the
real latest thing that happened, with no way to verify any claim against
the actual message sent or received. Current design:

- The banner's primary text is the latest concrete `AgentAction.description`
  — one real thing at a time, replacing itself in place as the run
  advances — not a canned phrase. The `STATUS_COPY` headline is demoted to
  a small phase tag (e.g. "Contacting the provider") shown only when it
  says something the primary text doesn't, and is the fallback text for a
  fresh run with no actions yet or a terminal one. The panel polls
  `GET /api/trips/[id]/activity` every ~12s (no websocket/SSE
  infrastructure in this stack, and polling a handful of trips this
  infrequently is cheap); the banner text is keyed on the latest action's
  id so a genuine change remounts with a brief fade rather than a jarring
  reflow.
- "View messages" (headline row, and per-run inside "View all activity")
  lazily fetches `GET /api/agent-runs/[id]/communications` — the actual
  `Communication` rows for that run: the real email Maestravl sent, the
  real reply it got back, rendered as plain text (never `dangerouslySetInnerHTML`
  — reply content is untrusted, provider-supplied text). This is the
  direct answer to "nothing to validate them": every `AgentAction`
  description is a paraphrase, this is the source it's paraphrasing.
- Full action history is opt-in behind "View all activity," not shown by
  default. Once opened, only the *most recent* disruption's timeline is
  expanded — earlier disruptions collapse into single summary rows
  (segment, status, update count, relative time) that only expand their
  own history when individually clicked, so a trip with several past
  disruptions doesn't dump everything at once.
- "Heard back?" appears whenever a run is genuinely waiting on someone
  (`WAITING_FOR_RESPONSE`/`ACTION_REQUIRED`) — the manual-resolve escape
  hatch described above.
- When a run reaches `RESCHEDULING` (see "Reply interpretation" above), the
  banner is replaced by a distinct confirm/decline prompt instead of the
  normal ticker — see that section for the full flow.

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

## Voice assistant

`lib/voice/*` + `app/components/VoiceWidget.tsx` + `app/api/trips/[id]/voice`
— a push-to-talk widget (mic button, fixed bottom-right, mounted only on
the trip detail page) that answers spoken questions about a trip using
real data, not a separate faked-up view of it.

- **Gemini-backed** (`GEMINI_API_KEY`, same free-tier rationale as "Why no
  paid AI API" above — genuinely ongoing and non-expiring, not a trial
  credit), with exactly three read-only tools (`lib/voice/tools.ts`):
  `get_itinerary`, `get_segment_status`, `get_recovery_activity`. There is
  no mutation tool — the assistant cannot change a booking, send a
  message, or approve an action; it can only describe what
  `lib/voice/tripContext.ts` already loaded from the database for that
  turn (itinerary, monitoring status, the 10 most recent `AgentRun`s and
  their actions — not raw `Communication` content).
- `lib/voice/resolveSegment.ts` matches a spoken reference ("my next
  flight," "the train to Kingston") against the trip's segments and
  returns `found | ambiguous | not_found` explicitly — it never guesses
  silently when a reference could mean more than one segment.
- `lib/voice/systemPrompt.ts` hard-rules that tools are the only source of
  truth (never answer from memory) and that a completed action is never
  claimed unless a tool actually reported it — same honesty boundary as
  the rest of this file.
- TTS (`lib/voice/tts.ts`) is ElevenLabs if both `ELEVENLABS_API_KEY` and
  `ELEVENLABS_VOICE_ID` are set; on any failure or if unset, the widget
  falls back to the browser's own `SpeechSynthesis` — a real browser API,
  not another paid account, so there's no billing path anywhere in this
  feature beyond the already-free Gemini call. Speech-to-text is
  client-side only (`SpeechRecognition`); the widget renders nothing if
  the browser doesn't support it.

## System health

`/system-health` (`app/api/system/health/route.ts` +
`app/(app)/system-health/page.tsx`, linked from the header nav) is a
standing, evidence-based answer to "does this integration actually work,"
replacing what used to be a one-time manual verification with no lasting
record. For each integration it reports two independent things: whether
the required env var(s) are set ("configured"), and whether real evidence
exists in the database that it has actually done something at least once
("confirmed") — e.g. inbound reply detection only shows confirmed once an
`INBOUND` `Communication` row exists, not just because
`RESEND_WEBHOOK_SECRET` is set. It never returns secret values, only
booleans/counts/timestamps, and is gated the same as every other
authenticated route (there's no separate admin role in this app). Train/
bus/ferry/taxi monitoring is always reported as "not implemented," never
as merely unconfigured, since the adapters are stubs regardless of any env
var (see "Monitoring abstraction" above and `docs/INTEGRATION.md`).

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
