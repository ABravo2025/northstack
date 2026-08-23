import { randomBytes, randomUUID } from 'node:crypto';
import type { calendar_v3 } from 'googleapis';
import prisma from '../../lib/prisma.js';
import { getAuthorizedClientForUser, markNeedsReconnectIfRevoked } from './googleCalendarAuthService.js';

// Reverse leg of Task sync (Google -> Northstack), Tasks only — Time Off stays
// one-way (see googleCalendarSyncService.ts's comment on why: it fans out to
// every connected user, so "who's allowed to edit it back" has no clean
// answer). Google's push notifications carry no event data, only "something
// changed" — this file's job is: open a "watch channel" per connected user,
// receive that notification, and turn it into the real diff via
// events.list(syncToken). Channels expire and must be reopened, not renewed
// in place — see renewExpiringWatchChannels, run by a daily cron
// (src/routes/internal.ts).
//
// Loop avoidance: every write this file makes to a Task uses a direct
// prisma.task.update(...), never taskService.updateTask() — that function
// unconditionally re-fires the outbound sync (syncTaskCalendarEvent) after
// every write, which would PATCH the very same change straight back to
// Google. Not an infinite loop (it'd converge in one pointless extra round
// trip since the values already match), but there's no reason to take that
// hop for a change that came *from* Google in the first place.

function webhookUrl(): string {
  const base = process.env.APP_BASE_URL ?? 'http://localhost:5173';
  return `${base}/api/integrations/google-calendar/webhook`;
}

// Opens a fresh channel and upserts the row — used both right after a user
// connects (googleCalendarAuthService.ts's callback) and by the renewal cron.
// Best-effort: if watch() fails (quota, revoked access, etc.), the one-way
// sync still works fine without this, so this never throws to its caller.
export async function openWatchChannelForUser(userId: string): Promise<void> {
  try {
    const calendar = await getAuthorizedClientForUser(userId);
    if (!calendar) return;

    const channelId = randomUUID();
    const channelToken = randomBytes(32).toString('hex');

    const { data } = await calendar.events.watch({
      calendarId: 'primary',
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl(),
        token: channelToken,
      },
    });

    if (!data.resourceId || !data.expiration) {
      console.error('Google Calendar events.watch() did not return resourceId/expiration');
      return;
    }

    // syncToken is deliberately left untouched on update — a new channel
    // doesn't invalidate the incremental-sync cursor, only calendar-side
    // data changes (or a 410 from Google) do.
    await prisma.googleCalendarWatchChannel.upsert({
      where: { userId },
      create: {
        userId,
        channelId,
        resourceId: data.resourceId,
        channelToken,
        expiration: new Date(Number(data.expiration)),
      },
      update: {
        channelId,
        resourceId: data.resourceId,
        channelToken,
        expiration: new Date(Number(data.expiration)),
      },
    });
  } catch (err) {
    await markNeedsReconnectIfRevoked(userId, err);
    console.error('Failed to open Google Calendar watch channel:', err);
  }
}

// Called on disconnect so a stale channel doesn't keep notifying us (and so
// Google doesn't count it against any per-account channel quota) — best
// effort, the local row is deleted regardless of whether stop() succeeds.
export async function stopWatchChannelForUser(userId: string): Promise<void> {
  const channel = await prisma.googleCalendarWatchChannel.findUnique({ where: { userId } });
  if (!channel) return;

  try {
    const calendar = await getAuthorizedClientForUser(userId);
    if (calendar) {
      await calendar.channels.stop({ requestBody: { id: channel.channelId, resourceId: channel.resourceId } });
    }
  } catch (err) {
    console.error('Failed to stop Google Calendar watch channel (deleting the local record regardless):', err);
  }

  await prisma.googleCalendarWatchChannel.delete({ where: { userId } }).catch(() => {});
}

interface ListResult {
  items: calendar_v3.Schema$Event[];
  nextSyncToken?: string | null;
}

// Follows pagination via nextPageToken, only the final page carries
// nextSyncToken. A 410 means the stored syncToken expired/is invalid — per
// Google's docs, the client must clear it and do one full resync from
// scratch (guarded so this only retries once, never loops).
async function listChangedEvents(calendar: calendar_v3.Calendar, storedSyncToken: string | null): Promise<ListResult> {
  let syncToken = storedSyncToken ?? undefined;
  let attemptedFullResync = false;

  while (true) {
    try {
      const items: calendar_v3.Schema$Event[] = [];
      let pageToken: string | undefined;
      let nextSyncToken: string | null | undefined;

      do {
        const { data } = await calendar.events.list({
          calendarId: 'primary',
          syncToken,
          pageToken,
          showDeleted: true,
        });
        items.push(...(data.items ?? []));
        pageToken = data.nextPageToken ?? undefined;
        if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
      } while (pageToken);

      return { items, nextSyncToken };
    } catch (err: any) {
      if (err?.code === 410 && !attemptedFullResync) {
        syncToken = undefined;
        attemptedFullResync = true;
        continue;
      }
      throw err;
    }
  }
}

// event.status === 'cancelled' means deleted in Google. Deliberately does
// NOT mark the Task completed or delete it — this codebase already committed
// to "hide, don't destroy" for completed tasks (see taskService.ts); removing
// an event from a calendar isn't the same claim as "this work is done."
// Instead the Task just goes back to having no due date (unscheduled, still
// open, drops off the Overview calendar until it gets a new date).
async function applyInboundEventChange(userId: string, event: calendar_v3.Schema$Event): Promise<void> {
  const task = await prisma.task.findFirst({ where: { assigneeId: userId, googleCalendarEventId: event.id } });
  if (!task) return; // not a Task-tracked event — ignore anything else on the user's calendar

  if (event.status === 'cancelled') {
    await prisma.task.update({ where: { id: task.id }, data: { dueDate: null, googleCalendarEventId: null } });
    return;
  }

  const startDateStr = event.start?.date ?? (event.start?.dateTime ? event.start.dateTime.slice(0, 10) : null);
  const incomingDueDate = startDateStr ? new Date(startDateStr) : null;
  const incomingTitle = event.summary ?? task.title;
  const incomingDescription = event.description ?? null;

  const dueDateChanged = (incomingDueDate?.getTime() ?? null) !== (task.dueDate?.getTime() ?? null);
  const titleChanged = incomingTitle !== task.title;
  const descriptionChanged = incomingDescription !== task.description;
  if (!dueDateChanged && !titleChanged && !descriptionChanged) return;

  await prisma.task.update({
    where: { id: task.id },
    data: { title: incomingTitle, description: incomingDescription, dueDate: incomingDueDate },
  });
}

// Called by the webhook route on every real (non-handshake) notification.
// Best-effort — a hiccup here must never surface past the webhook route,
// which always acks 200 to Google regardless (see googleCalendarIntegration.ts).
export async function processInboundCalendarChanges(userId: string): Promise<void> {
  try {
    const channel = await prisma.googleCalendarWatchChannel.findUnique({ where: { userId } });
    if (!channel) return;

    const calendar = await getAuthorizedClientForUser(userId);
    if (!calendar) return;

    const { items, nextSyncToken } = await listChangedEvents(calendar, channel.syncToken);

    // Persisted before processing individual events so a mid-loop failure
    // doesn't replay the same diff forever on the next notification.
    if (nextSyncToken) {
      await prisma.googleCalendarWatchChannel.update({ where: { userId }, data: { syncToken: nextSyncToken } });
    }

    for (const event of items) {
      if (!event.id) continue;
      await applyInboundEventChange(userId, event);
    }
  } catch (err) {
    await markNeedsReconnectIfRevoked(userId, err);
    console.error('processInboundCalendarChanges failed unexpectedly:', err);
  }
}

// Run daily (src/routes/internal.ts's cron route) — Google Calendar channels
// can't be renewed in place, only stopped and reopened. Picks up anything
// expiring within 48h, plus anything already past expiration as a self-heal.
export async function renewExpiringWatchChannels(): Promise<{ renewed: number; failed: number }> {
  const soon = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const expiring = await prisma.googleCalendarWatchChannel.findMany({ where: { expiration: { lt: soon } } });

  let renewed = 0;
  let failed = 0;
  for (const channel of expiring) {
    const calendar = await getAuthorizedClientForUser(channel.userId).catch(() => null);
    if (calendar) {
      await calendar.channels.stop({ requestBody: { id: channel.channelId, resourceId: channel.resourceId } }).catch(() => {});
    }

    try {
      await openWatchChannelForUser(channel.userId);
      renewed++;
    } catch (err) {
      failed++;
      console.error(`Failed to renew Google Calendar watch channel for user ${channel.userId}:`, err);
    }
  }

  return { renewed, failed };
}
