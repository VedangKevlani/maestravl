import 'dotenv/config';
import { runVoiceTurn } from '../lib/voice/agent.ts';
import { loadVoiceContext } from '../lib/voice/tripContext.ts';

const tripId = process.argv[2];
const context = await loadVoiceContext(tripId);

const pendingAction = {
  toolName: 'check_live_status',
  toolArgs: { segment: 'Amtrak train to Boston', mode: 'propose' },
  toolResult: {
    status: 'proposed',
    summary: 'Check Northeast Regional with the live tracker right now — this uses up one of a limited number of checks.',
    confirmationToken: 'cmsql4wx6001xyx24pzhr47mb',
    expiresInSeconds: 600,
  },
};

try {
  const result = await runVoiceTurn({
    context,
    history: [
      { role: 'user', content: 'Can you check the live status of the Amtrak train to Boston right now?' },
      { role: 'assistant', content: pendingAction.toolResult.summary + ' Would you like me to go ahead?' },
    ],
    transcript: 'Yes, go ahead.',
    tripId,
    userId: 'cmsiepkai0000z74qn9262pi2',
    pendingAction,
  });
  console.log('RESULT:', JSON.stringify(result, null, 2));
} catch (err) {
  console.error('THREW:', err);
}
