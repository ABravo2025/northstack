import {
  buildGoogleAuthUrl,
  disconnectGoogleCalendar,
  getGoogleCalendarConnectionStatus,
  googleCalendarConfigured,
  handleGoogleOAuthCallback,
} from '../modules/integrations/googleCalendarAuthService.js';
import { backfillCalendarSyncForUser } from '../modules/integrations/googleCalendarSyncService.js';
import {
  openWatchChannelForUser,
  processInboundCalendarChanges,
  stopWatchChannelForUser,
} from '../modules/integrations/googleCalendarWatchService.js';
import prisma from '../lib/prisma.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const googleCalendarIntegrationRouter = createAsyncRouter();

function appBaseUrl(): string {
  return process.env.APP_BASE_URL ?? 'http://localhost:5173';
}

googleCalendarIntegrationRouter.get('/api/integrations/google-calendar/status', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const status = await getGoogleCalendarConnectionStatus(user.id);
  return res.json(status);
});

// Returns the Google consent URL as JSON rather than redirecting directly —
// this route is called via an authenticated fetch() (Authorization: Bearer
// header), which a plain browser navigation to it wouldn't carry. The
// frontend does the actual `window.location.href = url` navigation itself.
googleCalendarIntegrationRouter.get('/api/integrations/google-calendar/connect', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!googleCalendarConfigured()) {
    return res.status(503).json({ error: 'Google Calendar sync is not configured yet.' });
  }

  const url = await buildGoogleAuthUrl(user.id, user.tenantId!);
  return res.json({ url });
});

// Hit directly by the browser as part of Google's OAuth redirect — no bearer
// token available here, so identity comes from the `state` row (see
// buildGoogleAuthUrl/handleGoogleOAuthCallback), not validateSession.
googleCalendarIntegrationRouter.get('/api/integrations/google-calendar/callback', async (req, res) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;

  if (!code || !state) {
    return res.redirect(`${appBaseUrl()}/settings/profile?googleCalendarError=1`);
  }

  const result = await handleGoogleOAuthCallback(code, state);
  if (!result.success) {
    return res.redirect(`${appBaseUrl()}/settings/profile?googleCalendarError=1`);
  }

  // One-time catch-up for whatever this user already had pending before
  // connecting — sync otherwise only fires reactively on the next
  // create/update/delete, so without this, pre-existing tasks/time off would
  // silently never appear in Google Calendar. Awaited (not fire-and-forget)
  // since Vercel serverless functions don't guarantee un-awaited work
  // survives past the response being sent.
  await backfillCalendarSyncForUser(result.userId!, result.tenantId!);

  // Opens the push-notification channel for the reverse (Google -> Northstack)
  // leg of Task sync — best-effort, never blocks the redirect if it fails.
  await openWatchChannelForUser(result.userId!);

  return res.redirect(`${appBaseUrl()}/settings/profile?googleCalendarConnected=1`);
});

googleCalendarIntegrationRouter.post('/api/integrations/google-calendar/disconnect', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  await stopWatchChannelForUser(user.id);
  await disconnectGoogleCalendar(user.id);
  return res.status(204).end();
});

// Hit directly by Google, never by our own frontend — no bearer token, no
// CSRF concern (Google doesn't send cookies), identity/authenticity comes
// entirely from the channel id + token matching a row we created ourselves
// (see googleCalendarWatchService.ts's module comment). Always acks 200
// regardless of outcome — erroring back to Google risks it disabling the
// channel after repeated failures, and any real problem here is already
// logged server-side for us to find later (same reasoning as Paddle/Mercado
// Pago's webhook handlers acking fast in src/routes/webhooks.ts).
googleCalendarIntegrationRouter.post('/api/integrations/google-calendar/webhook', async (req, res) => {
  const channelId = req.headers['x-goog-channel-id'] as string | undefined;
  const resourceId = req.headers['x-goog-resource-id'] as string | undefined;
  const resourceState = req.headers['x-goog-resource-state'] as string | undefined;
  const channelToken = req.headers['x-goog-channel-token'] as string | undefined;

  if (!channelId || !resourceId || !channelToken) {
    return res.status(200).end();
  }

  const channel = await prisma.googleCalendarWatchChannel.findUnique({ where: { channelId } });
  if (!channel || channel.resourceId !== resourceId || channel.channelToken !== channelToken) {
    return res.status(200).end();
  }

  // "sync" is the handshake Google sends immediately once watch() succeeds —
  // nothing changed yet, just acknowledge.
  if (resourceState !== 'sync') {
    await processInboundCalendarChanges(channel.userId);
  }

  return res.status(200).end();
});
