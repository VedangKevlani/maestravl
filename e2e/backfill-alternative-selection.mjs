// One-off correction: the current RESCHEDULING run's two real replies were
// processed by production before the matchedTime fix (commits a7de387,
// b2aa47b) existed, so their Alternative.selected flags are still stale.
// Re-runs the real, now-fixed classification logic (inlined here since this
// is a plain .mjs script, not a TS-loader-aware one — but the prompt/schema
// below is copied verbatim from the fixed lib/agents/replyInterpretation.ts)
// against the actual stored reply content, using the real Gemini API, and
// applies the same reconciliation inboundReply.ts now does.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { GoogleGenAI } from '@google/genai';

const prisma = new PrismaClient();
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function formatForPrompt(date, timezone) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    timeZone: timezone || 'UTC',
  }).format(date);
}

async function classifyReply({ replyText, segmentLabel, requestedTime, alternativeTime, timezone }) {
  const requested = requestedTime ? formatForPrompt(requestedTime, timezone) : null;
  const alternative = alternativeTime ? formatForPrompt(alternativeTime, timezone) : null;
  const prompt = [
    `A passenger's trip-recovery assistant asked a travel provider (for "${segmentLabel}") to move a booking to a new time.`,
    requested ? `Primary requested time: ${requested}.` : null,
    alternative ? `Fallback alternative time offered: ${alternative}.` : null,
    `The provider replied:\n"""\n${replyText}\n"""`,
    'Classify what this reply means. Respond with only ONE of these words: ACCEPTED, DECLINED, COUNTER_OFFER, UNCLEAR.',
    'ACCEPTED = they agreed to the requested or alternative time. DECLINED = they said no with no other option offered. COUNTER_OFFER = they proposed a different time or need more information first. UNCLEAR = ambiguous, unrelated, or an auto-reply.',
    'confidence must be an INTEGER from 0 to 100 (not a 0-1 probability).',
    requested && alternative
      ? `matchedTime: only set when intent is ACCEPTED — "PRIMARY" if the time they agreed to is the primary requested time (${requested}), "ALTERNATIVE" if it's the fallback time (${alternative}) instead. Otherwise "NONE".`
      : 'matchedTime: always "NONE" (no primary/alternative pair was offered).',
  ].filter(Boolean).join('\n');

  const response = await gemini.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          intent: { type: 'STRING', enum: ['ACCEPTED', 'DECLINED', 'COUNTER_OFFER', 'UNCLEAR'] },
          confidence: { type: 'NUMBER', description: 'Integer 0-100, not a 0-1 probability' },
          note: { type: 'STRING' },
          matchedTime: { type: 'STRING', enum: ['PRIMARY', 'ALTERNATIVE', 'NONE'] },
        },
        required: ['intent', 'confidence', 'note', 'matchedTime'],
      },
      maxOutputTokens: 1024,
    },
  });
  return JSON.parse(response.text.trim());
}

async function main() {
  const trip = await prisma.trip.findFirst({ where: { title: { contains: 'live test' } } });
  const run = await prisma.agentRun.findFirst({ where: { disruption: { segment: { tripId: trip.id } }, status: 'RESCHEDULING' }, orderBy: { createdAt: 'desc' } });
  if (!run) { console.log('No RESCHEDULING run found — nothing to backfill.'); return; }
  console.log('Backfilling run:', run.id);

  const inboundComms = await prisma.communication.findMany({
    where: { agentRunId: run.id, direction: 'INBOUND' },
    include: { segment: true },
  });

  for (const comm of inboundComms) {
    const [rescheduleRequest, primaryAlternative, backupAlternative] = await Promise.all([
      prisma.rescheduleRequest.findFirst({ where: { agentRunId: run.id, segmentId: comm.segmentId, status: 'REQUESTED' } }),
      prisma.alternative.findFirst({ where: { agentRunId: run.id, segmentId: comm.segmentId, rank: 1 } }),
      prisma.alternative.findFirst({ where: { agentRunId: run.id, segmentId: comm.segmentId, rank: 2 } }),
    ]);

    const interpretation = await classifyReply({
      replyText: comm.content,
      segmentLabel: comm.segment.identifier || comm.segment.provider || 'segment',
      requestedTime: rescheduleRequest?.requestedTime ?? null,
      alternativeTime: backupAlternative?.proposedTime ?? null,
      timezone: comm.segment.timezone,
    });

    console.log(comm.segment.identifier || comm.segment.provider, '-> real re-classification:', JSON.stringify(interpretation));

    if (interpretation.intent === 'ACCEPTED' && (primaryAlternative || backupAlternative)) {
      const wantsAlternative = interpretation.matchedTime === 'ALTERNATIVE';
      if (primaryAlternative) await prisma.alternative.update({ where: { id: primaryAlternative.id }, data: { selected: !wantsAlternative } });
      if (backupAlternative) await prisma.alternative.update({ where: { id: backupAlternative.id }, data: { selected: wantsAlternative } });
      console.log('  -> Alternative.selected reconciled: primary=', !wantsAlternative, 'alternative=', wantsAlternative);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
