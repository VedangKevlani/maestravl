# Ripple — The Autonomous Coordination Platform for Tourism

A cinematic, scroll-driven marketing website for Ripple, built for Awwwards-level quality.

## Tech Stack

- **Next.js 15** (App Router, TypeScript)
- **Tailwind CSS** — utility styling
- **Framer Motion** — scroll-driven animations, transitions
- **@studio-freight/lenis** — premium smooth scrolling
- **Lucide React** — icons

## Quick Start

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Structure

```
app/
  components/
    scenes/          # 10 cinematic scenes
      Scene1Silence.tsx       — Opening: airport, "one delay changes everything"
      Scene2Moment.tsx        — The disruption: departure board changes status
      Scene3RippleEffect.tsx  — Cascade: every stakeholder affected
      Scene4Chaos.tsx         — Disorder: cards scatter, coordination fails
      Scene5RippleAppears.tsx — Resolution: Ripple logo + notification cascade
      Scene6OneMessage.tsx    — Climax: "Everything has been handled."
      Scene7Caribbean.tsx     — The people: real Caribbean stakeholders
      Scene8Technology.tsx    — Interactive coordination graph
      Scene9WhyRipple.tsx     — Stats and features
      Scene10Closing.tsx      — Cinematic CTA with sunrise backdrop
  hooks/
    useLenis.ts      — Smooth scrolling setup
  globals.css        — Design tokens, typography, animations
  layout.tsx
  page.tsx           — Scene orchestrator
public/
  videos/            — sce1.mp4 through sce7.mp4 (scene footage)
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

The architecture is ready for:
- **Auth** — add NextAuth.js at `app/api/auth/`
- **Database** — Supabase client at `app/lib/supabase.ts`
- **Realtime** — Supabase Realtime channels
- **Operator Portal** — new route `app/operators/`
- **Customer Portal** — new route `app/portal/`
- **Payments** — Stripe at `app/api/checkout/`
- **Analytics** — Vercel Analytics (zero config)
