# Data sources, models, and third-party tools

Every external dependency Maestravl uses, why, and what it costs. See
`.env.example` for exact setup steps per integration and
`docs/ARCHITECTURE.md` for how each is wired into the pipeline. Non-negotiable
across this whole list (see `docs/ARCHITECTURE.md`): zero new paid services
beyond what's explicitly flagged opt-in-and-paid below — everything else is
free-tier with no credit card required.

## AI models

| Model | Used for | Tier |
|---|---|---|
| **Groq** — `llama-3.3-70b-versatile` (OpenAI-compatible API) | Voice assistant (`lib/voice/`) — read-only spoken Q&A about a trip | Free (no card; 14,400 requests/day) |
| **Google Gemini** — `gemini-3.6-flash` (`@google/genai`) | Reply interpretation (`lib/agents/replyInterpretation.ts`) — classifies a provider's email reply as ACCEPTED/DECLINED/COUNTER_OFFER/UNCLEAR, and which proposed time (if any) was accepted | Free (no card; ~20 requests/day working limit for this workload) |
| **ElevenLabs** (optional) | Premium text-to-speech for the voice assistant's replies | Paid, fully optional — falls back to the browser's own `SpeechSynthesis` with zero functionality loss if unset |
| **Tesseract.js** (open-source, self-hosted) | OCR fallback for scanned/image-only itinerary uploads | Free, runs locally, no network call, no data leaves the server |

Everything else in the app — itinerary field extraction, the dependency/
impact (cascade) engine, disruption classification, contact-confidence
scoring, message composition, the `AgentRun` state machine — is
deterministic, hand-written logic with no model in the loop. See "Why no
paid AI API" and "Agentic recovery" in `docs/ARCHITECTURE.md` for the
reasoning: AI is layered on top of tested, deterministic decisions, not
used as the decision-maker itself, except at the two genuine
language-understanding points above.

## Live monitoring data sources

| Source | Covers | Tier |
|---|---|---|
| **AviationStack** | Flight status (primary provider) | Free tier |
| **AeroDataBox** (RapidAPI) | Flight status (fallback once AviationStack's monthly quota is spent) | Free tier |
| **Transitland** (transit.land) | Train + bus status, GTFS/GTFS-realtime aggregator, 55+ countries | Free tier (10,000 REST queries/month, no card) |

Rental car, taxi, ferry, and cruise monitoring were researched and have
**no free, self-serve status API** (Avis/Booking.com/OpenNDC and Uber/Lyft-
style dispatch APIs are all partner-agreement-gated) — see
`docs/INTEGRATION.md` for what was checked. These remain honest stubs, not
silent gaps: the UI reports them as "not implemented," never as merely
unconfigured.

## Communication channels

| Service | Used for | Tier |
|---|---|---|
| **Resend** | Outbound provider/passenger email, plus real inbound-reply detection via a signature-verified webhook | Free tier |
| **Twilio** | SMS + WhatsApp passenger notifications (`lib/sms.ts`), alongside email, for a passenger who may not see an email in time mid-disruption | SMS: free trial credit, real per-message cost in production (opt-in). WhatsApp: free via Twilio's Sandbox (recipient must join once) |

**Outbound email — resolved 2026-09.** Earlier builds sent from Resend's
shared sandbox sender (`onboarding@resend.dev`), which by Resend's own
design only delivers to the email address that signed up for the Resend
account, not arbitrary real passengers/providers — every real send during
testing before this had to deliberately go to the team's own inbox. Never
a silent failure either way: `lib/email.ts` throws on a rejected send and
`orchestrator.ts` logs the `Communication`/`AgentAction` as `FAILED`,
never a fake success. `maestravl.com` is now verified with Resend
(SPF/DKIM records added) and pointed at this Vercel deployment, and
`EMAIL_FROM` now defaults to `Maestravl <notifications@maestravl.com>` —
real delivery to any recipient. (This was never a Vercel-hosting
limitation — verifying a sending domain with Resend and pointing DNS at
Vercel are two independent steps that happened to land around the same
time.)

**Inbound reply detection is unaffected by this and still uses its
existing configuration** — enabling inbound *receiving* on the new domain
is a separate, still-pending step in Resend, not yet done as of this
writing. Don't change `RESEND_INBOUND_DOMAIN` until that's confirmed.

## Platform / infrastructure

| Service | Used for |
|---|---|
| **Supabase** (Postgres + Storage) | Primary database and encrypted document blob storage |
| **Prisma 5** | ORM / schema / migrations |
| **Auth.js (NextAuth v5)** | Credential-based auth, JWT sessions |
| **Vercel** | Hosting/deployment (`https://www.maestravl.com`, migrated from `maestravl.vercel.app` 2026-09) |
| **GitHub Actions** | Scheduled monitoring cron (every 30 min — see `.github/workflows/monitoring-cron.yml`) |

## Open-source libraries doing real work (no external API, no cost)

- **pdfjs-dist** (Mozilla) — native PDF text extraction
- **tesseract.js** — OCR (see above)
- **chrono-node** — natural-language date/time parsing
- **pdf-lib** — activity-log PDF export
- **@dnd-kit** — drag-and-drop segment reordering
- **zod** — API input validation
- **framer-motion**, **@studio-freight/lenis** — marketing landing page animation/scroll

## Non-API data

- **Airport/airline dictionaries** (`lib/data/`) — hand-curated subsets used
  for code lookup and timezone resolution. Swappable for the full
  [openflights.org](https://openflights.org/data.html) open dataset without
  touching any calling code (`lookupAirport`/`lookupAirline` are the only
  entry points) — not yet done, curated subset is sufficient for the
  itineraries tested so far.

## Deliberately evaluated and not used

Researched as potential free search/data sources and ruled out (see
`docs/ARCHITECTURE.md`'s "Contact discovery" section for detail): Boardy
(networking agent, not a search API), OllyGarden (observability tool, not
relevant), Nebius (LLM inference hosting, no search/grounding product
found), Brave Search free tier (discontinued Feb 2026), Google Custom
Search JSON API (closed to new signups). **MiniMax's** `web_search` Server
Tool is the one team resource that is a real search capability — used only
as a last-resort contact-discovery fallback, genuinely paid
(~$0.01/request) and opt-in via `MINIMAX_API_KEY`.

## Ground-transport deep link

**Uber** — `lib/uber.ts` opens Uber's own app/website with pickup/dropoff
prefilled (`https://m.uber.com/looking?client_id=...`). Not an API
integration, not a booking, no payment handling — a free `client_id` from
Uber's developer dashboard is the only requirement, no business approval
needed. Real API booking (Riders API / Guest Rides) was investigated and
rejected: both are book-and-track only, can't check the status of a ride
booked elsewhere, and would require building payment infrastructure this
app deliberately has none of.
