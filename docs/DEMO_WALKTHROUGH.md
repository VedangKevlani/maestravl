# Demo walkthrough

Live app: **https://maestravl.com**

This is a real deployed app connected to real third-party services, not a
staged demo build — every step below drives the actual production system.
Before presenting, confirm the same env vars documented in
`.env.example`/`docs/DATA_SOURCES.md` are actually set in the Vercel
project (this doc was written against local `.env`; Vercel's own
environment variables weren't checked as part of writing it).

Each step below names which rubric criterion (Future Caribbean's "Agentic
AI Excellence": architecture, autonomy, orchestration, reasoning, human
oversight, implementation quality, real-world impact) it's demonstrating,
so a judge can map what they're clicking to what's being scored.

## 1. Sign up and create a trip (~2 min)

1. `/signup` → create an account.
2. `/trips/new` → either upload a real itinerary PDF/image (exercises the
   OCR/extraction pipeline — a scanned/photographed ticket forces the OCR
   path, a text-based PDF/confirmation email screenshot takes the faster
   native-text path), or add 2-3 segments manually (e.g. a flight, then a
   connecting flight or hotel a few hours later) via "+ Add Segment."
   - **Demonstrates:** implementation quality — confidence-scored field
     extraction, not just a form.
   - **Setup note for a clean live demo:** outbound email now delivers to
     any real recipient (`maestravl.com` is verified with Resend as of
     2026-09 — see `docs/DATA_SOURCES.md`), so this is about courtesy, not
     a technical limitation. Put a real, reachable email address you
     control in the segment's **Notes** field, formatted like a real
     booking confirmation ("Contact: reservations@youraddress.com") —
     contact discovery reads notes text, so this becomes the "provider
     contact" the agent emails. Do this rather than using a real airline/
     hotel's actual support address for a demo, so the walkthrough doesn't
     send an unsolicited email to a real business. Skipping this still
     demonstrates everything through step 2 (detection, impact analysis)
     — it just means step 3's "View messages" and step 4's reply loop
     won't have a real send to show.

## 2. Trigger a disruption (~1 min)

1. On the trip page, find a segment's boarding pass and click **"Report
   Delay"**. Enter a new time far enough out to be genuinely disruptive
   (30+ minutes, or later than a downstream segment's own scheduled start
   to force a real missed-connection case).
2. Watch the boarding pass update **live** — the segment's own status
   pill flips to DELAYED, and a recovery ribbon appears showing the
   `AgentRun`'s real-time progress (DETECTED → ANALYZING → CONTACTING →
   WAITING_FOR_RESPONSE), each line pulled from an actual `AgentAction`
   the agent just logged, not a canned phrase.
   - **Demonstrates:** autonomous agent use, orchestration (a resumable
     state machine, not a single scripted function), and the dependency/
     impact cascade engine deciding *what's actually affected* before
     anything downstream happens.
3. If a second segment exists close enough behind the disrupted one to be
   affected, note that its own boarding pass **also** shows the recovery
   ribbon — proof the agent is coordinating across segments, not just
   reacting to the one directly disrupted.

## 3. View what the agent actually did (~1 min)

1. Click **"View messages"** on the ribbon — this is the real
   `Communication` row: the actual email drafted and sent to whatever
   contact the agent discovered (from the itinerary text itself, not
   invented), rendered as plain text.
2. Open **"Trip Updates"** (the trip-wide tab) for the full audit trail —
   every `AgentAction` the run has taken, in plain language, timestamped.
   - **Demonstrates:** human oversight design / auditability — nothing the
     agent does is a black box; every autonomous step produced a
     human-readable log line before or as it happened.

## 4. The AI reasoning step + human confirm (~2 min, or reference the
   already-verified proof point below)

The full loop needs a real reply to land in the inbox the agent emailed —
not something a judge can trigger instantly mid-demo. Two ways to show it:

- **Live, if time allows:** reply to the email the agent sent (it'll have
  landed wherever the discovered/test contact address points) with
  something like "Yes, that works" or "No, can you do 6pm instead?" and
  refresh the trip page within a minute or two. The run should move to
  **RESCHEDULING** with Gemini's interpreted summary and a link to the
  real reply text, plus two buttons: **"Confirm — update itinerary"** or
  **"Not quite."** Clicking Confirm actually rewrites the segment's
  departure/arrival time — the only place in this codebase a recovery
  run's own action ever mutates a scheduled time, and only after this
  explicit human gate.
- **Already verified, if not:** this exact loop was run for real in
  production on 2026-08-13 — a real outbound email, a real reply, correct
  webhook threading via the per-message Reply-To address, a correct
  ACCEPTED classification, and a human confirm that genuinely updated the
  segment. `/system-health`'s `email-inbound` row is the standing,
  evidence-based proof this isn't a one-time fluke: it only shows
  "confirmed" because a real inbound `Communication` row exists in the
  database, not because a webhook secret happens to be set.
  - **Demonstrates:** reasoning capability (genuine language
    understanding — not keyword matching — deciding accepted vs.
    declined vs. counter-offer vs. unclear) and human oversight (a
    confident AI read still never auto-executes a real change).

Alternatively, click **"Heard back?"** on the ribbon at any point while a
run is `WAITING_FOR_RESPONSE`/`ACTION_REQUIRED` for the instant manual
path — the passenger asserting resolution themselves, which the agent
takes at face value rather than trying to verify on its own.

## 5. Prove it's real, not simulated (~1 min)

Visit **`/system-health`** — an evidence-based status page for every
integration, reporting two independent things per row: whether it's
*configured* (an env var is set) and whether it's *confirmed* (real
evidence exists in the database that it has actually done something at
least once — e.g. inbound reply detection only turns green once a real
inbound message exists, not because a secret is set). This is the direct
answer to "how do we know this isn't just a nice-looking mock."

## 6. Extras, if time allows

- **Voice assistant** (mic button, bottom-right on the trip page) — ask
  it "what's my next flight" or "has anything changed with my trip" — a
  real Groq-backed, read-only Q&A loop over the trip's actual data (never
  invents an answer; explicitly says so when a tool call fails rather than
  guessing).
- **Onboarding tour** — visible to any brand-new account automatically; a
  guided first-run walkthrough of the dashboard/trip flow.
- **Get an Uber there** — appears on a delayed/cancelled segment's
  boarding pass when a next segment's location is resolvable. Note this
  specific feature is unverified live as of this doc's writing (see
  `docs/DATA_SOURCES.md`) — `NEXT_PUBLIC_UBER_CLIENT_ID` needs to be set
  in the Vercel deployment for the button to render at all.
