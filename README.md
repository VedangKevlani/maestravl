# Maestravl — The Autonomous Coordination Platform for Tourism

A cinematic, scroll-driven marketing site (`/`) plus a working **Travel
Intelligence Engine** (`/dashboard`, `/trips/*`) — itinerary upload, OCR +
rule-based extraction, a confidence-scored review/edit UI, and a pluggable
monitoring architecture. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
for how the engine is built and [`docs/INTEGRATION.md`](docs/INTEGRATION.md)
for connecting real monitoring providers later.

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
    scenes/          # 10 cinematic scenes
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
  hooks/
    useLenis.ts      — Smooth scrolling setup
  globals.css        — Design tokens, typography, animations
  layout.tsx
  page.tsx           — Scene orchestrator
public/
  videos/            — sce1.mp4 through sce7.mp4 (scene footage)

app/(app)/           — auth-gated routes: /dashboard, /trips/new, /trips/[id]
app/login, app/signup
app/api/
  auth/              — Auth.js handler + custom signup endpoint
  trips/, segments/  — trip/passenger/segment CRUD + reordering
  upload/            — file upload → extraction → segment creation
  documents/[id]/file/ — authenticated, decrypt-on-read document retrieval
lib/
  extraction/        — text extraction, rule-based parsing, normalization
  monitoring/        — MonitoringAdapter interface + per-transport adapters
  security/          — file validation, at-rest encryption
  data/              — airport/airline code dictionaries
  db.ts, auth.ts, constants.ts
prisma/schema.prisma — Trip, Passenger, Segment, Document, MonitoringRecord
docs/
  ARCHITECTURE.md    — how the extraction/monitoring pipeline works
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
Postgres) — see the Travel Intelligence Engine section above.

Still ahead — see [`docs/INTEGRATION.md`](docs/INTEGRATION.md) for specifics:
- **Live monitoring** — flight status is connected (AviationStack); train/bus/
  ferry adapters are still stubbed, just need an API key + the fetch call
  filled in
- **Realtime** — push status changes to the dashboard as monitoring checks land
- **Operator Portal** — new route `app/operators/`
- **Payments** — Stripe at `app/api/checkout/`
- **Analytics** — Vercel Analytics (zero config)
- **Boarding pass QR / wallet export / calendar sync / email import** —
  each attaches to the extraction pipeline's `raw bytes/text in →
  ExtractedItinerary out` contract without touching the parser or schema
