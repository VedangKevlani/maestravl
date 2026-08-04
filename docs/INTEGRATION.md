# Integration guide — connecting real providers

Everything in this doc is about *turning on* functionality that's already
architecturally wired up but intentionally left disconnected (no fabricated
data, no paid API assumed). Each section says exactly what to change.

## Connecting live flight monitoring

`lib/monitoring/adapters/flightAdapter.ts` is a stub. To connect a real
provider:

1. Pick a provider. Realistic options, cheapest first:
   - **OpenSky Network** (free, no key for low-volume anonymous use) — gives
     raw ADS-B position data, not commercial delay/gate status. Good for a
     "is this aircraft airborne/landed" signal, not full status.
   - **AviationStack** (free tier: 100 requests/month, then paid) — real
     flight status, delays, gates.
   - **FlightAware AeroAPI** (paid, but the most complete commercial data).
2. Set the adapter's env var, e.g. `FLIGHT_MONITORING_API_KEY=...` in `.env`.
3. In `flightAdapter.ts` (or rather `adapters/stubAdapter.ts`'s `check()`
   override for flights), replace the `TODO` with a `fetch()` call using
   `buildTrackingKey(segment)` (currently `IDENTIFIER:YYYY-MM-DD`) to look up
   the flight, and map the response onto `MonitoringCheckResult`.
4. Nothing else changes — `lib/monitoring/service.ts` and the registry
   already call `adapter.check()` uniformly.

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
