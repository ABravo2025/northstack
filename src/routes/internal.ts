import { runPlanTransitions } from '../modules/tenant/planTransitionService.js';
import { renewExpiringWatchChannels } from '../modules/integrations/googleCalendarWatchService.js';
import { runStalledOpportunityReminders } from '../modules/crm/stalledOpportunityService.js';
import { runStripeEventPolling } from '../modules/integrations/stripePaymentsService.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import type express from 'express';

export const internalRouter = createAsyncRouter();

// Shared by every /api/internal/* cron route below.
function checkCronSecret(req: express.Request, res: express.Response, routeName: string): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('CRON_SECRET is not configured — refusing to run in production');
      res.status(500).json({ error: 'CRON_SECRET is not configured' });
      return false;
    }
    console.warn(`CRON_SECRET is not configured — ${routeName} is running unauthenticated`);
    return true;
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

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
  if (!checkCronSecret(req, res, '/api/internal/plan-transitions/run')) return;

  const result = await runPlanTransitions();
  return res.json(result);
});

// Triggered once a day by Vercel Cron — Google Calendar watch channels (the
// push-notification mechanism behind Task sync's Google -> Northstack leg,
// see googleCalendarWatchService.ts) expire and can't be renewed in place,
// only stopped and reopened.
internalRouter.get('/api/internal/google-calendar-channels/renew', async (req, res) => {
  if (!checkCronSecret(req, res, '/api/internal/google-calendar-channels/renew')) return;

  const result = await renewExpiringWatchChannels();
  return res.json(result);
});

// Triggered once a day by Vercel Cron — stalled-deal reminders
// (docs/tareas/specredisenosalesv2.md §3.8). Unlike the two crons above (silent
// billing/infra housekeeping), this one writes user-visible Notifications and
// sends real email, so it also skips suspended/cancelled tenants (see
// stalledOpportunityService.ts).
internalRouter.get('/api/internal/opportunities/stalled-reminders/run', async (req, res) => {
  if (!checkCronSecret(req, res, '/api/internal/opportunities/stalled-reminders/run')) return;

  const result = await runStalledOpportunityReminders();
  return res.json(result);
});

// Triggered twice a day by Vercel Cron — replaces the per-tenant manual Stripe webhook entirely
// (backlog QA, 2026-08-28). Polls each connected tenant's own Stripe account for new Events since
// the last run and feeds them through the same notification logic a webhook would have triggered
// (see stripePaymentsService.ts's runStripeEventPolling/processStripeWebhookEvent).
internalRouter.get('/api/internal/stripe-events/poll', async (req, res) => {
  if (!checkCronSecret(req, res, '/api/internal/stripe-events/poll')) return;

  const result = await runStripeEventPolling();
  return res.json(result);
});
