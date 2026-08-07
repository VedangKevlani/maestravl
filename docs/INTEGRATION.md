# Integration guide — connecting real providers

Everything in this doc is about *turning on* functionality that's already
architecturally wired up but intentionally left disconnected (no fabricated
data, no paid API assumed). Each section says exactly what to change.

## Connecting live flight monitoring

`lib/monitoring/adapters/flightAdapter.ts` is connected to **AviationStack**
(free tier: 100 requests/month, then paid — real flight status, delays,
gates). Set `FLIGHT_MONITORING_API_KEY=...` in `.env` to your AviationStack
`access_key` to turn it on; the adapter reports `UNKNOWN` with a "not
connected yet" message until the key is present. Note the free tier only
serves over plain HTTP — the adapter uses `http://api.aviationstack.com`
accordingly; switch it to `https://` if the key is upgraded to a paid plan.

**Free-tier gotcha:** the `flight_date` query param (looking up a flight on
a specific date) 403s on the free plan with `function_access_restricted` —
it's a paid-plan-only feature. The adapter queries by `flight_iata` alone
instead and picks the result matching the segment's departure date
client-side, since a flight number can recur daily. This means a flight
number with no result on the current "live window" AviationStack returns
(it doesn't serve arbitrary past/future dates on the free tier either) will
still come back `UNKNOWN` even with a valid key.

Other realistic options if you want to swap providers later:
- **OpenSky Network** (free, no key for low-volume anonymous use) — gives
  raw ADS-B position data, not commercial delay/gate status. Good for a
  "is this aircraft airborne/landed" signal, not full status.
- **FlightAware AeroAPI** (paid, but the most complete commercial data).

## Scheduled monitoring checks

`lib/monitoring/service.ts` computes a `nextCheckAt` (6h out — see the
`CHECK_INTERVAL_MS` comment there for the quota math) each time a segment is
checked, but nothing calls `runMonitoringCheck` automatically — something
external has to hit `GET /api/cron/monitoring` on a schedule with header
`Authorization: Bearer $CRON_SECRET`. That route (via
`runDueMonitoringChecks`) finds every actively-monitored segment whose
`nextCheckAt` has passed and checks it.

**Why 6 hours:** AviationStack's free tier is 100 requests/month *total*,
not per segment. A single segment checked every 30 minutes alone burns
~1,440 requests/month. At 6h intervals one segment costs ~120/month — still
over budget with more than one or two segments active at once. Multi-user
production use will need a paid AviationStack plan; adjust
`CHECK_INTERVAL_MS` down once that's in place.

**Wiring it up:** this app runs on Vercel Hobby, which has historically
restricted cron job frequency more than a 6h schedule needs (Pro allows
finer-grained crons). Rather than gamble on that, the primary trigger is
`.github/workflows/monitoring-cron.yml` — a GitHub Actions scheduled
workflow that `curl`s `https://maestravl.vercel.app/api/cron/monitoring`
every 6 hours with `Authorization: Bearer $CRON_SECRET`. `vercel.json` still
declares its own cron hitting the same route as a backup, at whatever
cadence Hobby actually permits — harmless either way, since the route only
acts on segments whose `nextCheckAt` has passed, so redundant calls no-op.

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
