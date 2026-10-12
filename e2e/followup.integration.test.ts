// Opt-in DB integration check for lib/agents/followUp.ts, driven by
// e2e/verify-agentic-features.mjs. Skipped in normal `npm test` runs —
// it talks to whatever DATABASE_URL points at (in this project, the real
// database), and is always scoped to one run id so it can't draft
// follow-ups in anyone else's runs.
//
//   RUN_DB_INTEGRATION=1 FOLLOWUP_RUN_ID=<run id> npx vitest run e2e/followup.integration.test.ts
import { describe, it, expect } from 'vitest'
import { draftFollowUps } from '@/lib/agents/followUp'

const runId = process.env.FOLLOWUP_RUN_ID

describe.skipIf(!process.env.RUN_DB_INTEGRATION || !runId)('draftFollowUps (live DB, one run)', () => {
  it('drafts exactly one follow-up for a silent provider, and never a second', async () => {
    expect(await draftFollowUps(new Date(), { runIds: [runId!] })).toBe(1)
    // The run is now AWAITING_APPROVAL, so a second sweep finds nothing.
    expect(await draftFollowUps(new Date(), { runIds: [runId!] })).toBe(0)
  })
})
