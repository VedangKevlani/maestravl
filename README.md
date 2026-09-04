# Maestravl — The Autonomous Coordination Platform for Tourism

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A cinematic, scroll-driven marketing site (`/`) plus a working **Travel
Intelligence Engine** (`/dashboard`, `/trips/*`) — itinerary upload, OCR +
rule-based extraction, a confidence-scored review/edit UI, and an
autonomous disruption-recovery agent built on a pluggable monitoring
architecture. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how
the engine and recovery pipeline are built,
[`docs/INTEGRATION.md`](docs/INTEGRATION.md) for connecting real
monitoring providers, [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) for
every data source/model/third-party tool in use, and
[`docs/DEMO_WALKTHROUGH.md`](docs/DEMO_WALKTHROUGH.md) for a live walkthrough
of the agentic recovery flow. Live demo: **https://maestravl.com**.

Licensed under [MIT](LICENSE).

## Tech Stack

**Marketing site**
- **Next.js 15** (App Router, TypeScript)
- **Tailwind CSS** — utility styling
- **Framer Motion** — scroll-driven animations, transitions
- **@studio-freight/lenis** — premium smooth scrolling

**Travel Intelligence Engine**
- **Prisma 5 + Supabase Postgres** — persistence (free tier)
- **Supabase Storage** — encrypted document blobs (free tier; local disk
  storage doesn't persist on serverless hosts like Vercel)
- **Auth.js (NextAuth v5)** — credentials auth, JWT sessions
- **pdfjs-dist** + **tesseract.js** — layered text extraction (native PDF
  text, OCR fallback) — both free/open-source, no external API calls
- **chrono-node** — natural-language date/time parsing
- **@dnd-kit** — touch-friendly drag-and-drop timeline reordering
- **zod** — API input validation
- **Vitest** — unit tests (`npm test`)

**Agentic disruption recovery** (see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
for the full pipeline) — `lib/agents/` + `lib/dependency/`
- Deterministic dependency/impact engine (missed-connection cascade math)
  decides what's actually affected by a delay/cancellation before anything
  autonomous happens
- A resumable `AgentRun` state machine finds a provider contact, drafts and
  sends a real request by email (Resend), and proposes ranked reschedule
  alternatives — every step logged to an audit trail, nothing ever claims
  a resolution it didn't verify
- Real inbound-reply detection (signature-verified webhook) + a scoped
  Gemini call (`lib/agents/replyInterpretation.ts`) that reads what a
  reply actually means — the one deliberate exception to this codebase's
  "deterministic logic first" rule — gated behind an explicit human
  confirm before anything is rewritten
- Passenger notifications over email + SMS/WhatsApp (Twilio); a Groq-backed
  read-only voice assistant (`lib/voice/`) answers spoken questions about a
  trip from real data, never from memory
- Live monitoring: flights (AviationStack/AeroDataBox rotator), train/bus
  (Transitland) — see `docs/INTEGRATION.md` for what's connected vs. stubbed

## Quick Start

```bash
npm install
cp .env.example .env   # fill in your Supabase project's values (see comments in the file)
npx prisma migrate dev # applies the schema to your Supabase Postgres DB
npm run dev
# Open http://localhost:3000 for the marketing site
# Open http://localhost:3000/signup to try the Travel Intelligence Engine
```

Needs a free [Supabase](https://supabase.com) project — a Postgres database
plus a private Storage bucket named `documents` (Storage -> New bucket,
"Public" off). See `.env.example` for exactly which values to copy from the
Supabase dashboard.

Required env vars (see `.env.example`): `DATABASE_URL`, `DIRECT_URL`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET`,
`FILE_ENCRYPTION_KEY`. Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # FILE_ENCRYPTION_KEY
```

Run the unit test suite with `npm test`. Run a production build with
`npm run build && npm run start` (the dev server's on-demand compilation can
mask timing-sensitive issues that a real build won't have).

## Structure

```
app/
  components/
    scenes/          # 10 cinematic scenes (marketing landing page)
      Scene1Silence.tsx       — Opening: airport, "one delay changes everything"
      Scene2Moment.tsx        — The disruption: departure board changes status
      Scene3CascadeEffect.tsx     — Cascade: every stakeholder affected
      Scene4Chaos.tsx             — Disorder: cards scatter, coordination fails
      Scene5MaestravlAppears.tsx  — Resolution: Maestravl logo + notification cascade
      Scene6OneMessage.tsx        — Climax: "Everything has been handled."
      Scene7Caribbean.tsx         — The people: real Caribbean stakeholders
      Scene8Technology.tsx        — Interactive coordination graph
      Scene9WhyMaestravl.tsx      — Stats and features
      Scene10Closing.tsx      — Cinematic CTA with sunrise backdrop
    auth/            — shared shell + password-input for login/signup/reset
    chat/            — draggable chat popup wrapping the voice assistant
    onboarding/      — first-login interactive tour (state, overlay, steps)
    BoardingPass.tsx — the core trip UI: per-segment status, live recovery
                       ribbon, "View messages," "Heard back?," Uber deep link
    TripActivityTabs.tsx  — trip-wide disruption/recovery history, exportable
    TransportTypeForm.tsx — segment create/edit form (all 15 transport types)
    VoiceWidget.tsx  — push-to-talk mic button, mounted on the trip page
  hooks/
    useLenis.ts      — Smooth scrolling setup (marketing page)
  styles/            — CSS modules per surface (dashboard, trip, auth, modals, chat...)
  globals.css        — Design tokens, typography, animations
  layout.tsx
  page.tsx           — Scene orchestrator (marketing landing page)
public/
  videos/            — sce1.mp4 through sce7.mp4 (scene footage)

app/(app)/           — auth-gated routes: /dashboard, /trips/new, /trips/[id],
                        /notifications, /system-health
app/login, app/signup, app/forgot-password, app/reset-password
app/api/
  auth/              — Auth.js handler + custom signup endpoint
  trips/, segments/  — trip/passenger/segment CRUD + reordering
  agent-runs/        — recovery-run actions: resolve, confirm-reschedule,
                        read the real Communication content behind a run
  upload/            — file upload → extraction → segment creation
  documents/[id]/file/ — authenticated, decrypt-on-read document retrieval
  webhooks/resend-inbound/ — signature-verified inbound provider-reply webhook
  cron/monitoring/   — scheduled monitoring checks (GitHub Actions, every 30 min)
  system/health/     — evidence-based per-integration status (configured vs. confirmed)
  notifications/     — passenger-facing unread-update feed
lib/
  agents/            — the recovery pipeline: detection, orchestration, contact
                        discovery, messaging, reply interpretation, policy
  dependency/        — pure dependency/impact (cascade) engine
  monitoring/        — MonitoringAdapter interface + per-transport adapters
                        (flight, train/bus real; car/taxi/ferry/cruise stubs)
  voice/             — Groq-backed read-only voice assistant
  extraction/        — text extraction, rule-based parsing, normalization
  security/          — file validation, at-rest encryption
  data/              — airport/airline code dictionaries
  email.ts, sms.ts, uber.ts, dateFormat.ts — outbound channels + shared
                        timezone-aware time formatting/parsing
  db.ts, auth.ts, constants.ts
prisma/schema.prisma — Trip, Passenger, Segment, Document, MonitoringRecord,
                        Disruption, AgentRun, AgentAction, Communication,
                        RescheduleRequest, Alternative
docs/
  ARCHITECTURE.md    — how the extraction/monitoring/recovery pipeline works
  INTEGRATION.md      — connecting real monitoring providers, LLM parsing, etc.
```

## Deployment to Vercel

```bash
npm install -g vercel
vercel --prod
```

Or connect your GitHub repo at vercel.com — zero configuration needed.

## Video Assets

Place scene videos at `public/videos/sce1.mp4` through `sce7.mp4`.
Each video: 1280×720, ~10s, used as atmospheric backdrops.

Scene mapping:
- `sce1` → Scene 1 (calm traveller at gate)
- `sce2` → Scene 2 (wide airport terminal)
- `sce3` → Scene 7 Caribbean (driver at resort)
- `sce4` → Scene 6 (woman with phone, double exposure)
- `sce5` → Scene 4 (marina, man with tablet)
- `sce6` → Scene 3 Caribbean (driver at airport)
- `sce7` → Scene 10 Closing (traveller with phone)

## Design Tokens

```css
--charcoal: #141414        /* Primary background */
--warm-white: #f5f3ef      /* Primary text */
--ocean-bright: #4aa0d8    /* Accent: technology/AI nodes */
--sand: #c8b89a            /* Accent: editorial headings */
--emerald-light: #52b788   /* Accent: success/stakeholders */
--amber: #d4a853           /* Accent: disruption/warning */
```

## Performance

- All animations GPU-accelerated (transform/opacity only)
- Videos lazy-load with `autoplay muted loop playsInline`
- Reduced motion respected via CSS media query
- No layout shift — pinned sections use `sticky` positioning

## Accessibility

- Semantic HTML throughout
- Videos are decorative (no captions required — background only)
- Color contrast AA compliant for all text
- Keyboard navigation supported
- ARIA roles on interactive nodes (Scene 8 graph)

## Future Integrations

**Done:** Auth (Auth.js credentials + JWT), database (Prisma + Supabase
Postgres), live flight/train/bus monitoring, the full agentic disruption
recovery pipeline (detection → contact discovery → messaging → reply
interpretation → confirmed reschedule), email + SMS/WhatsApp passenger
notifications, a read-only voice assistant, an onboarding tour — see the
sections above and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how
each is built.

**Built but not yet verified against live data/credentials** (see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)'s "Known limitations" and
`/system-health` for current status): the Transitland train/bus adapter,
the Uber ground-transport deep link (`NEXT_PUBLIC_UBER_CLIENT_ID` is
unset), and SMS/WhatsApp (configured, never actually sent one yet).

Still ahead — see [`docs/INTEGRATION.md`](docs/INTEGRATION.md) for specifics:
- **Rental car / taxi / ferry / cruise monitoring** — researched, no free
  self-serve status API exists for any of them (partner-agreement-gated);
  a real dead end for this iteration, not a deferred decision
- **Realtime** — push status changes to the dashboard as monitoring checks
  land, instead of polling/refetch
- **Alternative picking sophistication** — reply interpretation already
  picks between the two proposed reschedule times based on what a reply
  said; it doesn't yet handle a genuinely novel counter-offer time
- **Operator Portal** — new route `app/operators/`
- **Payments** — Stripe at `app/api/checkout/`
- **Analytics** — Vercel Analytics (zero config)
- **Boarding pass QR / wallet export / calendar sync / email import** —
  each attaches to the extraction pipeline's `raw bytes/text in →
  ExtractedItinerary out` contract without touching the parser or schema
