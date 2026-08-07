# Integration guide — connecting real providers

Everything in this doc is about *turning on* functionality that's already
architecturally wired up but intentionally left disconnected (no fabricated
data, no paid API assumed). Each section says exactly what to change.

## Connecting live flight monitoring

`lib/monitoring/adapters/flightAdapter.ts` is a small **rotator**, not a
single provider — it tries every *configured* provider in
`lib/monitoring/adapters/flight/`, in priority order, and falls through to
the next one once the current provider's free-tier quota for the calendar
month is spent (or it errors). This exists because any one free flight-data
tier is too small to cover more than a couple of trips a month on its own
(see the budget math below) — combining two roughly quadruples the usable
budget for zero cost.

**Provider 1 — AviationStack** (`flight/aviationStack.ts`). Free tier: 100
requests/month, then paid. Set `FLIGHT_MONITORING_API_KEY=...` in `.env` to
your AviationStack `access_key` to turn it on. Note the free tier only
serves over plain HTTP — the adapter uses `http://api.aviationstack.com`
accordingly; switch it to `https://` if the key is upgraded to a paid plan.
**Free-tier gotcha:** the `flight_date` query param (looking up a flight on
a specific date) 403s on the free plan with `function_access_restricted` —
it's a paid-plan-only feature. The adapter queries by `flight_iata` alone
instead and picks the result matching the segment's departure date
client-side, since a flight number can recur daily.

**Provider 2 — AeroDataBox** (`flight/aeroDataBox.ts`), via RapidAPI. Free
"Basic" plan: 600 API units/month, 1 request/second. Sign up at
[rapidapi.com/aedbx-aedbx/api/aerodatabox](https://rapidapi.com/aedbx-aedbx/api/aerodatabox)
(no card required for the free plan) and set `AERODATABOX_API_KEY=...` to
your RapidAPI key. **Unverified field mapping:** this adapter was written
against AeroDataBox's published docs, not a live response — if it's
consistently returning `UNKNOWN` despite a valid key and remaining quota,
log a raw `check()` result and check the field names in `aeroDataBox.ts`'s
`mapStatus` against what's actually coming back. Also confirm the
`unitsPerCall` assumption (currently 2, i.e. Tier 2 pricing) against your
own RapidAPI dashboard after a few real calls — get it wrong and the
rotator either under- or over-estimates how much budget is left.
**RapidAPI's monthly reset date isn't documented precisely** (daily quotas
reset on a rolling 24h from subscription time; monthly reset timing wasn't
confirmed as calendar-month) — `ProviderUsage` assumes calendar-month
buckets for both providers, which may drift from AeroDataBox's actual reset
day. Worth double-checking once the account has real usage history.

**Adding a third provider:** implement `FlightProviderAdapter` (see
`flight/types.ts` — same shape as `MonitoringAdapter` plus `monthlyQuota`
and `unitsPerCall`) and add it to the `PROVIDERS` array in
`flightAdapter.ts`. Realistic candidates:
- **OpenSky Network** (free; 400 credits/day anonymous, 4,000/day for a
  free registered account) — gives raw ADS-B position data, not commercial
  delay/gate status. Good for an "is this aircraft airborne/landed" signal
  layered on top of the other two, not a drop-in replacement.
- **FlightAware AeroAPI** (paid, but the most complete commercial data).

## Scheduled monitoring checks

`lib/monitoring/service.ts` computes each segment's own `nextCheckAt` after
every check — see `computeCheckIntervalMs` there — but nothing calls
`runMonitoringCheck` automatically — something external has to hit
`GET /api/cron/monitoring` on a schedule with header
`Authorization: Bearer $CRON_SECRET`. That route (via
`runDueMonitoringChecks`) finds every actively-monitored segment whose
`nextCheckAt` has passed and checks it.

**Polling cadence scales with proximity to departure**, rather than a flat
interval, so quota is spent where a status change is actually likely and
urgent:

| Time to departure | Interval |
| --- | --- |
| >72h | every 12h |
| 24-72h | every 6h |
| 6-24h | every 2h |
| ≤6h, and in-flight | every 30min |

Once a segment reaches a terminal status (`ARRIVED`/`CANCELLED`), or it's
been more than 24h since departure with no terminal status resolved,
`MonitoringRecord.status` flips to `PAUSED` and `runDueMonitoringChecks`
stops picking it up — there's nothing left worth spending quota on.

**Why this shape:** a flat 30min interval for one segment alone burns
~1,440 requests/month; a flat 6h interval costs ~120/month. Tiering means a
segment spends most of its life (days out from departure) being checked
cheaply, and only gets checked every 30min during the narrow window — a few
hours before departure through landing — where a delay/cancellation
actually matters. One segment's full lifecycle costs roughly ~40-50 requests
this way.

That per-segment cost is what makes a single free provider a hard ceiling:
AviationStack alone (100/month) covers barely two segments a month before
later trips get silently starved of checks — the quota gets claimed by
whichever segment happens to poll first, not by whichever segment needs it
most. Two things fix that, and both live in `flightAdapter.ts`:

1. **Combined budget across providers.** AviationStack (100/month) +
   AeroDataBox (~300/month, see above) gives roughly 400 requests/month
   instead of 100 — enough for several concurrent trips rather than one or
   two — for zero added cost, once `AERODATABOX_API_KEY` is set. See
   "Connecting live flight monitoring" above for setup and caveats.
2. **Usage is tracked per-provider, not pre-allocated per-segment, and spent
   in departure order.** `runMonitoringCheck` doesn't reserve budget for a
   segment in advance — every check queries `ProviderUsage` for what's
   actually been spent this month and picks whichever provider still has
   room. And `runDueMonitoringChecks` processes due segments soonest-
   departure-first, so if a run's combined budget runs tight, whichever
   segment is closest to departure gets checked before one that's still
   days out, rather than losing out to whatever happened to be created
   first. Multiple trips degrade gracefully together (checks get less
   frequent for everyone as the month's combined budget runs low) instead
   of the first trip getting full coverage and the rest getting none.

None of this removes the hard ceiling — if several flights all cluster
departure windows in the same week, the combined ~400/month can still run
out — but it spends what's available where it matters and across
whichever segments actually need it. Heavier multi-user production use
will still need a paid plan on at least one provider.

**Wiring it up:** this app runs on Vercel Hobby, which has historically
restricted cron job frequency more than this app needs (Pro allows
finer-grained crons). Rather than gamble on that, the primary trigger is
`.github/workflows/monitoring-cron.yml` — a GitHub Actions scheduled
workflow that `curl`s `https://maestravl.vercel.app/api/cron/monitoring`
**every 30 minutes** with `Authorization: Bearer $CRON_SECRET`, so segments
in the imminent tier actually get checked that often. `vercel.json` still
declares its own cron hitting the same route as a backup, at whatever
cadence Hobby actually permits — harmless either way, since the route only
acts on segments whose `nextCheckAt` has passed, so redundant calls no-op
and don't cost extra AviationStack quota.

To activate the GitHub Actions path:
1. Add a repository secret named `CRON_SECRET` (GitHub repo → Settings →
   Secrets and variables → Actions → New repository secret) with the same
   value as `CRON_SECRET` in `.env`.
2. Make sure the Vercel project itself has **all** the `.env` values set as
   real environment variables (Vercel project → Settings → Environment
   Variables) — `.env` is gitignored and never gets deployed, so production
   won't have `CRON_SECRET`, `RESEND_API_KEY`, `FLIGHT_MONITORING_API_KEY`,
   etc. until they're added there directly.
3. You can fire it manually anytime from the repo's Actions tab
   (`workflow_dispatch`) instead of waiting for the schedule, to confirm it
   works end-to-end.

Two honest caveats about GitHub Actions schedules: they're best-effort (can
lag during high load on GitHub's side, sometimes by 10-15min), and GitHub
auto-disables scheduled workflows after 60 days with no repo activity (any
push resets the clock). For a real-user-facing feature, periodically check
the Actions tab isn't silently disabled.

## Connecting live train/bus monitoring

Many transit agencies publish free **GTFS-realtime** feeds (a standard
protobuf format). `lib/monitoring/adapters/trainAdapter.ts` and
`busAdapter.ts` are the two stub adapters to fill in; the approach is the
same as flights — implement `check()`, gate it behind an env var.

## Connecting ferry/cruise/maritime monitoring

`boatAdapter.ts` covers `FERRY`, `CRUISE`, and `BOAT`. Most ferry/cruise
operators don't expose public APIs; the realistic path here is usually a
per-operator scraper or a manual "confirm this segment's status" flow in the
UI rather than automated polling. Marine AIS position data (similar to
OpenSky for aircraft) is available from providers like MarineTraffic if
position-based inference is worth it later.

## Upgrading the parser to use a paid LLM

If a paid Anthropic/OpenAI key becomes available later, the extraction
*text* pipeline (`extractText.ts`) doesn't need to change — only the
*parsing* step does. Add a new file, e.g. `lib/extraction/parseWithLLM.ts`,
implementing the same signature as `parseItinerary` in
`lib/extraction/parse.ts`:

```ts
function parseItinerary(rawText: string, referenceDate?: Date): ExtractedItinerary
```

Swap the import in `app/api/upload/route.ts`. Confidence scores from an LLM
call should still be honest — don't hardcode 100; have the model self-report
per-field certainty, or fall back to the existing heuristic bands.

## Other "Future Ready" items from the original spec

- **Boarding pass QR codes**: QR payloads for airline boarding passes follow
  the IATA BCBP standard (fixed-width fields). A decoder is a self-contained
  addition to `lib/extraction/` — add `parseBcbp(qrString)` and call it
  before falling back to OCR when a QR code is detected in an uploaded
  image (e.g. via a free QR-decoding library).
- **Google Wallet / Apple Wallet**: both accept `.pkpass` / wallet-object
  JSON as *output* formats. This is an export feature, not an extraction
  one — a new `lib/export/` module reading a `Segment` and producing the
  wallet payload, no changes to the ingestion pipeline.
- **Calendar sync**: same shape — an export module producing `.ics` from a
  trip's segments.
- **Email inbox import**: would add a new "source" alongside file upload —
  an IMAP/Gmail-API poller that hands raw email bodies to the *same*
  `extractText` → `parseItinerary` → `normalizeItinerary` pipeline used for
  uploads today.

In every case above, the pattern is the same: the ingestion pipeline's
internal contract (`raw bytes/text in → ExtractedItinerary out`) is the
seam. New sources or new output formats attach to that seam without
touching the parser, the schema, or the editor UI.
