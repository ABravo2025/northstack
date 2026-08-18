import { runPlanTransitions } from '../modules/tenant/planTransitionService.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const internalRouter = createAsyncRouter();

// Triggered once a day by Vercel Cron (see the `crons` entry in vercel.json) —
// spec-subscription-plans.md's trialing -> past_due -> suspended state machine. Vercel signs
// cron-triggered requests with `Authorization: Bearer $CRON_SECRET` automatically once
// CRON_SECRET is set as a project env var (same mechanism Vercel itself recommends for
// protecting Cron endpoints from being hit by anyone who finds the URL).
//
// Unauthenticated only when explicitly allowed (local dev, NODE_ENV !== 'production') and
// CRON_SECRET isn't configured yet — testable locally with a plain `curl`/browser hit. In
// production, a missing secret fails closed (500) instead of running unauthenticated: this
// route mutates every tenant's billing status, so "misconfigured" must not mean "wide open."
// CRON_SECRET must be added to Vercel's env vars before this ships to staging/production, the
// same way PAYMENT_DATA_ENCRYPTION_KEY was for Payroll.
internalRouter.get('/api/internal/plan-transitions/run', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('CRON_SECRET is not configured — refusing to run in production');
      return res.status(500).json({ error: 'CRON_SECRET is not configured' });
    }
    console.warn('CRON_SECRET is not configured — /api/internal/plan-transitions/run is running unauthenticated');
  } else if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const result = await runPlanTransitions();
  return res.json(result);
});
