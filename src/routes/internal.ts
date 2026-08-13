import { runPlanTransitions } from '../modules/tenant/planTransitionService.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const internalRouter = createAsyncRouter();

// Triggered once a day by Vercel Cron (see the `crons` entry in vercel.json) —
// spec-subscription-plans.md's trialing -> past_due -> suspended state machine. Vercel signs
// cron-triggered requests with `Authorization: Bearer $CRON_SECRET` automatically once
// CRON_SECRET is set as a project env var (same mechanism Vercel itself recommends for
// protecting Cron endpoints from being hit by anyone who finds the URL).
//
// Same graceful-degradation posture as mailerConfigured() elsewhere in this codebase: if
// CRON_SECRET isn't configured (e.g. local dev, or before it's added to Vercel), the check is
// skipped with a console warning instead of hard-failing — this endpoint is testable locally
// with a plain `curl`/browser hit. CRON_SECRET must be added to Vercel's env vars before this
// ships to staging/production, the same way PAYMENT_DATA_ENCRYPTION_KEY was for Payroll.
internalRouter.get('/api/internal/plan-transitions/run', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.authorization !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else {
    console.warn('CRON_SECRET is not configured — /api/internal/plan-transitions/run is running unauthenticated');
  }

  const result = await runPlanTransitions();
  return res.json(result);
});
