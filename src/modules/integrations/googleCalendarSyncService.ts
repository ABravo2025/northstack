import type { Task, TimeOffRequest } from '@prisma/client';
import type { calendar_v3 } from 'googleapis';
import prisma from '../../lib/prisma.js';
import { getAuthorizedClientForUser, markNeedsReconnectIfRevoked } from './googleCalendarAuthService.js';

// Best-effort, one-way (Northstack -> Google) sync. Every exported function
// here MUST NOT throw — a Google Calendar hiccup must never break the
// underlying Task/TimeOffRequest request, mirroring how email sending
// (lib/mailer.ts) is best-effort and never blocks the caller.

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

    const eventBody: calendar_v3.Schema$Event = {
      summary: current.title,
      description: current.description ?? undefined,
      start: { date: current.dueDate!.toISOString().slice(0, 10) },
      end: { date: current.dueDate!.toISOString().slice(0, 10) },
    };

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

// Time off: only an approved request has a calendar event. Pending/rejected/
// cancelled/deleted all mean "no event" (a pending request never had one, so
// that path is a no-op, kept for symmetry with the task version above).
export async function syncTimeOffCalendarEvent(
  previous: TimeOffRequest | null,
  current: TimeOffRequest | null,
): Promise<void> {
  try {
    const wantsEvent = !!current && current.status === 'approved';
    const requestId = current?.id ?? previous?.id;
    const employeeId = current?.employeeId ?? previous?.employeeId;
    const existingEventId = current?.googleCalendarEventId ?? previous?.googleCalendarEventId;

    if (!employeeId || !requestId) return;

    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { userId: true } });
    if (!employee?.userId) return; // time off can be recorded for a profile with no linked platform user

    if (!wantsEvent) {
      if (existingEventId) {
        const calendar = await getAuthorizedClientForUser(employee.userId);
        if (calendar) {
          try {
            await deleteGoogleEvent(calendar, existingEventId);
          } catch (err) {
            await markNeedsReconnectIfRevoked(employee.userId, err);
          }
        }
        await prisma.timeOffRequest.update({ where: { id: requestId }, data: { googleCalendarEventId: null } }).catch(() => {});
      }
      return;
    }

    const calendar = await getAuthorizedClientForUser(employee.userId);
    if (!calendar) return;

    const request = current!;
    // Google's all-day `end.date` is exclusive, so a request spanning
    // startDate..endDate (both inclusive) needs one day added to endDate.
    const endExclusive = new Date(request.endDate);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

    const eventBody: calendar_v3.Schema$Event = {
      summary: 'Time off',
      description: request.note ?? undefined,
      start: { date: request.startDate.toISOString().slice(0, 10) },
      end: { date: endExclusive.toISOString().slice(0, 10) },
    };

    try {
      if (existingEventId) {
        await calendar.events.patch({ calendarId: 'primary', eventId: existingEventId, requestBody: eventBody });
      } else {
        const { data } = await calendar.events.insert({ calendarId: 'primary', requestBody: eventBody });
        await prisma.timeOffRequest.update({ where: { id: request.id }, data: { googleCalendarEventId: data.id ?? null } });
      }
    } catch (err) {
      await markNeedsReconnectIfRevoked(employee.userId, err);
      console.error('Failed to sync time off request to Google Calendar:', err);
    }
  } catch (err) {
    console.error('syncTimeOffCalendarEvent failed unexpectedly:', err);
  }
}
