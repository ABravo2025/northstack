import type { Task, TimeOffRequest } from '@prisma/client';
import type { calendar_v3 } from 'googleapis';
import prisma from '../../lib/prisma.js';
import { getAuthorizedClientForUser, markNeedsReconnectIfRevoked } from './googleCalendarAuthService.js';

// Best-effort, one-way (Northstack -> Google) sync. Every exported function
// here MUST NOT throw — a Google Calendar hiccup must never break the
// underlying Task/TimeOffRequest request, mirroring how email sending
// (lib/mailer.ts) is best-effort and never blocks the caller.

const ONE_HOUR_MS = 60 * 60 * 1000;

// A Task's dueDate is either date-only (always exactly UTC midnight — no
// time was ever set in TaskForm) or a real instant (a specific time was
// picked, converted from local time to UTC on submit) — see TaskForm.tsx's
// matching comment. All-day events use Google's `date` field; a real instant
// uses `dateTime` instead, so the event shows at the actual hour in Google
// Calendar rather than as a full-day block. Tasks have no explicit duration,
// so a timed event gets a flat 1-hour block purely for visual sizing on the
// calendar — it doesn't mean anything about how long the task takes.
function taskEventBody(task: Task): calendar_v3.Schema$Event {
  const due = task.dueDate!;
  const hasTime = due.getUTCHours() !== 0 || due.getUTCMinutes() !== 0 || due.getUTCSeconds() !== 0;

  return {
    summary: task.title,
    description: task.description ?? undefined,
    ...(hasTime
      ? {
          start: { dateTime: due.toISOString(), timeZone: 'UTC' },
          end: { dateTime: new Date(due.getTime() + ONE_HOUR_MS).toISOString(), timeZone: 'UTC' },
        }
      : {
          start: { date: due.toISOString().slice(0, 10) },
          end: { date: due.toISOString().slice(0, 10) },
        }),
  };
}

async function deleteGoogleEvent(calendar: calendar_v3.Calendar, eventId: string): Promise<void> {
  try {
    await calendar.events.delete({ calendarId: 'primary', eventId });
  } catch (err: any) {
    // 410/404 just means it's already gone (e.g. the user deleted it by hand
    // on the Google side) — nothing to do. Anything else is a real failure,
    // logged but swallowed (best-effort).
    if (err?.code !== 410 && err?.code !== 404) {
      console.error('Failed to delete Google Calendar event:', err);
    }
  }
}

// Tasks: dueDate present + not completed -> event exists on the assignee's
// calendar; anything else (no due date, completed, or deleted) -> no event.
export async function syncTaskCalendarEvent(previous: Task | null, current: Task | null): Promise<void> {
  try {
    const assigneeChanged = !!previous && !!current && previous.assigneeId !== current.assigneeId;

    // Task deleted, or reassigned away: the old event (if any) lives on the
    // *previous* assignee's calendar and must be cleaned up there. For a
    // straight delete there's no row left to clear googleCalendarEventId on;
    // for a reassignment the field gets overwritten below if a new event is
    // created, or explicitly cleared if not.
    if (previous?.googleCalendarEventId && (current === null || assigneeChanged)) {
      const oldCalendar = await getAuthorizedClientForUser(previous.assigneeId);
      if (oldCalendar) {
        try {
          await deleteGoogleEvent(oldCalendar, previous.googleCalendarEventId);
        } catch (err) {
          await markNeedsReconnectIfRevoked(previous.assigneeId, err);
        }
      }
    }

    if (!current) return; // deleted — nothing left to create/patch/clear

    const wantsEvent = !!current.dueDate && !current.completedAt;

    if (!wantsEvent) {
      // Not reassigned: any existing event is still under this same
      // assignee's calendar and needs deleting directly. Reassigned: already
      // handled above via the previous assignee's calendar.
      if (current.googleCalendarEventId && !assigneeChanged) {
        const calendar = await getAuthorizedClientForUser(current.assigneeId);
        if (calendar) {
          try {
            await deleteGoogleEvent(calendar, current.googleCalendarEventId);
          } catch (err) {
            await markNeedsReconnectIfRevoked(current.assigneeId, err);
          }
        }
      }
      if (current.googleCalendarEventId) {
        await prisma.task.update({ where: { id: current.id }, data: { googleCalendarEventId: null } }).catch(() => {});
      }
      return;
    }

    const calendar = await getAuthorizedClientForUser(current.assigneeId);
    if (!calendar) return; // assignee never connected Google Calendar (or needs to reconnect) — nothing to sync

    const eventBody = taskEventBody(current);

    try {
      // A pre-existing event only carries over if the assignee didn't
      // change — otherwise it belongs to someone else's calendar and a
      // fresh one must be created here instead.
      if (current.googleCalendarEventId && !assigneeChanged) {
        await calendar.events.patch({ calendarId: 'primary', eventId: current.googleCalendarEventId, requestBody: eventBody });
      } else {
        const { data } = await calendar.events.insert({ calendarId: 'primary', requestBody: eventBody });
        await prisma.task.update({ where: { id: current.id }, data: { googleCalendarEventId: data.id ?? null } });
      }
    } catch (err) {
      await markNeedsReconnectIfRevoked(current.assigneeId, err);
      console.error('Failed to sync task to Google Calendar:', err);
    }
  } catch (err) {
    console.error('syncTaskCalendarEvent failed unexpectedly:', err);
  }
}

// Time off is team-wide visibility, not personal (2026-08-23, Alejandro's
// explicit call): every connected user in the tenant sees every employee's
// approved time off on their own calendar — same "shared team calendar"
// Time Off already has on the Overview page, just mirrored into Google. So
// one TimeOffRequest can fan out into N Google events (one per connected
// user), tracked in TimeOffCalendarSync (one row per request+viewer pair).
async function syncTimeOffEventForViewer(
  request: TimeOffRequest,
  employeeName: string,
  wantsEvent: boolean,
  viewerUserId: string,
): Promise<void> {
  const existingSync = await prisma.timeOffCalendarSync.findUnique({
    where: { timeOffRequestId_userId: { timeOffRequestId: request.id, userId: viewerUserId } },
  });

  if (!wantsEvent) {
    if (!existingSync) return;
    const calendar = await getAuthorizedClientForUser(viewerUserId);
    if (calendar) {
      try {
        await deleteGoogleEvent(calendar, existingSync.googleCalendarEventId);
      } catch (err) {
        await markNeedsReconnectIfRevoked(viewerUserId, err);
      }
    }
    await prisma.timeOffCalendarSync.delete({ where: { id: existingSync.id } }).catch(() => {});
    return;
  }

  const calendar = await getAuthorizedClientForUser(viewerUserId);
  if (!calendar) return;

  // Google's all-day `end.date` is exclusive, so a request spanning
  // startDate..endDate (both inclusive) needs one day added to endDate.
  const endExclusive = new Date(request.endDate);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  const eventBody: calendar_v3.Schema$Event = {
    summary: `${employeeName} — Time off`,
    description: request.note ?? undefined,
    start: { date: request.startDate.toISOString().slice(0, 10) },
    end: { date: endExclusive.toISOString().slice(0, 10) },
  };

  try {
    if (existingSync) {
      await calendar.events.patch({ calendarId: 'primary', eventId: existingSync.googleCalendarEventId, requestBody: eventBody });
    } else {
      const { data } = await calendar.events.insert({ calendarId: 'primary', requestBody: eventBody });
      if (data.id) {
        await prisma.timeOffCalendarSync.create({
          data: { tenantId: request.tenantId, timeOffRequestId: request.id, userId: viewerUserId, googleCalendarEventId: data.id },
        });
      }
    }
  } catch (err) {
    await markNeedsReconnectIfRevoked(viewerUserId, err);
    console.error('Failed to sync time off request to Google Calendar:', err);
  }
}

// Pending/rejected/cancelled/deleted all mean "no event" for every viewer
// (a pending request never had one, so that path is a no-op for viewers who
// never got a sync row, kept for symmetry with the task version above).
export async function syncTimeOffCalendarEvent(
  previous: TimeOffRequest | null,
  current: TimeOffRequest | null,
): Promise<void> {
  try {
    const request = current ?? previous;
    if (!request) return;

    const wantsEvent = current?.status === 'approved';

    const [employee, connections] = await Promise.all([
      prisma.employee.findUnique({ where: { id: request.employeeId }, select: { firstName: true, lastName: true } }),
      prisma.googleCalendarConnection.findMany({ where: { tenantId: request.tenantId }, select: { userId: true } }),
    ]);
    if (!employee) return;
    const employeeName = `${employee.firstName} ${employee.lastName}`;

    for (const connection of connections) {
      await syncTimeOffEventForViewer(request, employeeName, wantsEvent, connection.userId);
    }
  } catch (err) {
    console.error('syncTimeOffCalendarEvent failed unexpectedly:', err);
  }
}

// Sync only ever fires reactively, on the next create/update/delete after a
// user connects (see taskService.ts/timeOffRequestService.ts's call sites) —
// it never looks backward. Without this, everything a user already had
// pending *before* connecting would silently never appear in their Google
// Calendar until they happened to touch it again. Called once, right after a
// connection is established (handleGoogleOAuthCallback) — best-effort, same
// never-throws contract as the two functions above.
export async function backfillCalendarSyncForUser(userId: string, tenantId: string): Promise<void> {
  try {
    const pendingTasks = await prisma.task.findMany({
      where: { tenantId, assigneeId: userId, dueDate: { not: null }, completedAt: null, googleCalendarEventId: null },
    });
    for (const task of pendingTasks) {
      await syncTaskCalendarEvent(null, task);
    }

    // Team-wide, not just this user's own — every tenant employee's approved
    // time off gets pushed to the newly-connected user's calendar too (see
    // syncTimeOffCalendarEvent's comment on why this fans out per viewer).
    const approvedTimeOff = await prisma.timeOffRequest.findMany({
      where: { tenantId, status: 'approved' },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
    for (const request of approvedTimeOff) {
      const employeeName = `${request.employee.firstName} ${request.employee.lastName}`;
      await syncTimeOffEventForViewer(request, employeeName, true, userId);
    }
  } catch (err) {
    console.error('backfillCalendarSyncForUser failed unexpectedly:', err);
  }
}
