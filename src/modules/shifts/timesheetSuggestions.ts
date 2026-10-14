import type { TimeEntrySource } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { listGoogleEventsForCalendarView } from '../integrations/googleCalendarSyncService.js';
import { addDays, formatMinute, shiftDurationMinutes, zonedDateString, zonedToUtc } from './shiftTime.js';
import { linkedClient, MINUTES_PER_DAY, type TimesheetEmployee } from './timesheetService.js';

// Shifts module, Unidad 9 (spec-shifts.md §0.7) — "a timesheet that fills itself": what the person
// probably worked on this week, from what already happened in Northstack. Computed every time the
// week is opened and never stored; suggest, never log on their behalf (the person always confirms).
// Already-logged and dismissed ones are left out.
//
//   shift    — accepted shifts that have ended (minutes = the shift's length)
//   task     — tasks completed this week (minutes = the task's time spent, when someone said)
//   meeting  — tasks with a time and a video call, once over (1 h, the same block Google shows)
//   calendar — the person's own Google Calendar events that aren't Northstack tasks or shifts

export interface TimeSuggestion {
  sourceType: TimeEntrySource;
  sourceId: string;
  date: string;
  minutes: number | null;
  title: string;
  detail: string | null;
  // Shifts only: the clocked time (when there was a punch) and the planned length.
  clockedMinutes?: number | null;
  plannedMinutes?: number;
  companyId: string | null;
  projectId: string | null;
}

const MEETING_MINUTES = 60;

const isTimed = (d: Date) => d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0 || d.getUTCSeconds() !== 0;

export async function computeSuggestions(
  employee: TimesheetEmployee,
  weekStart: string,
  timeZone: string,
  now: Date,
): Promise<TimeSuggestion[]> {
  const weekEnd = addDays(weekStart, 6);
  // The week as instants in the viewer's timezone (tasks and calendar events are instants).
  const from = zonedToUtc(weekStart, 0, timeZone);
  const to = zonedToUtc(addDays(weekStart, 7), 0, timeZone);

  const [logged, dismissed] = await Promise.all([
    prisma.timeEntry.findMany({ where: { employeeId: employee.id, sourceId: { not: null } }, select: { source: true, sourceId: true } }),
    prisma.timeSuggestionDismissal.findMany({ where: { employeeId: employee.id }, select: { sourceType: true, sourceId: true } }),
  ]);
  const skip = new Set([...logged.map((e) => `${e.source}:${e.sourceId}`), ...dismissed.map((d) => `${d.sourceType}:${d.sourceId}`)]);
  const out: TimeSuggestion[] = [];
  const push = (s: TimeSuggestion) => {
    if (!skip.has(`${s.sourceType}:${s.sourceId}`)) out.push(s);
  };

  // Shifts: by the shift's own (location) date.
  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      employeeId: employee.id,
      status: 'accepted',
      shift: { status: 'published', endsAt: { lte: now }, date: { gte: new Date(`${weekStart}T00:00:00Z`), lte: new Date(`${weekEnd}T00:00:00Z`) } },
    },
    include: { shift: { include: { location: { select: { name: true } } } } },
  });
  // Phase 2, block B: when the shift was clocked, the suggestion is the clocked time (in − out −
  // breaks), with the planned time next to it.
  const punches = assignments.length
    ? await prisma.clockEntry.findMany({
        where: { shiftAssignmentId: { in: assignments.map((a) => a.id) }, status: { in: ['closed', 'auto_closed'] } },
        select: { shiftAssignmentId: true, clockInAt: true, clockOutAt: true, breakMinutes: true },
      })
    : [];
  const clocked = new Map<string, number>();
  for (const p of punches) {
    if (!p.shiftAssignmentId || !p.clockOutAt) continue;
    const minutes = Math.max(0, Math.round((p.clockOutAt.getTime() - p.clockInAt.getTime()) / 60_000) - p.breakMinutes);
    clocked.set(p.shiftAssignmentId, (clocked.get(p.shiftAssignmentId) ?? 0) + minutes);
  }
  for (const a of assignments) {
    const s = a.shift;
    const planned = shiftDurationMinutes(s.startMinute, s.endMinute);
    const fromClock = clocked.get(a.id);
    push({
      sourceType: 'shift',
      sourceId: a.id,
      date: s.date.toISOString().slice(0, 10),
      minutes: fromClock !== undefined ? Math.min(fromClock, MINUTES_PER_DAY) : planned,
      title: s.position ?? s.location.name,
      detail: `${formatMinute(s.startMinute)}–${formatMinute(s.endMinute)} · ${s.location.name}`,
      clockedMinutes: fromClock ?? null,
      plannedMinutes: planned,
      companyId: null,
      projectId: null,
    });
  }

  if (employee.userId) {
    const tasks = await prisma.task.findMany({
      where: {
        tenantId: employee.tenantId,
        assigneeId: employee.userId,
        OR: [
          { completedAt: { gte: from, lt: to } },
          { hasVideoCall: true, dueDate: { gte: from, lt: to, lte: new Date(now.getTime() - MEETING_MINUTES * 60000) } },
        ],
      },
      select: { id: true, title: true, entityType: true, entityId: true, completedAt: true, dueDate: true, hasVideoCall: true, timeSpentMinutes: true },
    });
    for (const task of tasks) {
      const meeting = task.hasVideoCall && !!task.dueDate && isTimed(task.dueDate) && task.dueDate >= from && task.dueDate < to;
      const when = meeting ? task.dueDate! : task.completedAt;
      if (!when) continue;
      // A dated task that was due and completed this week shows once, as a meeting if it was one.
      if (!meeting && task.hasVideoCall && task.dueDate && isTimed(task.dueDate)) continue;
      const linked = await linkedClient(employee.tenantId, task.entityType, task.entityId);
      push({
        sourceType: meeting ? 'meeting' : 'task',
        sourceId: task.id,
        date: zonedDateString(when, timeZone),
        // A task's own time spent wins (also for a meeting that ran longer or shorter).
        minutes: task.timeSpentMinutes && task.timeSpentMinutes <= MINUTES_PER_DAY ? task.timeSpentMinutes : meeting ? MEETING_MINUTES : null,
        title: task.title,
        detail: meeting ? formatMinute(minuteOfDay(when, timeZone)) : null,
        ...linked,
      });
    }

    // Google Calendar: only the person's own events; never Northstack's own tasks (excluded by the
    // listing) or shifts (their event ids are on ShiftCalendarSync).
    const connected = await prisma.googleCalendarConnection.findUnique({ where: { userId: employee.userId }, select: { id: true } }).catch(() => null);
    if (connected) {
      const [events, shiftEvents] = await Promise.all([
        listGoogleEventsForCalendarView(employee.userId, from.toISOString(), to.toISOString()),
        prisma.shiftCalendarSync.findMany({ where: { userId: employee.userId }, select: { googleCalendarEventId: true } }),
      ]);
      const shiftEventIds = new Set(shiftEvents.map((e) => e.googleCalendarEventId));
      for (const ev of events) {
        if (ev.allDay || !ev.end || shiftEventIds.has(ev.id)) continue;
        const start = new Date(ev.start);
        const end = new Date(ev.end);
        if (end > now) continue;
        const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
        if (minutes < 1 || minutes > MINUTES_PER_DAY) continue;
        push({
          sourceType: 'calendar',
          sourceId: ev.id,
          date: zonedDateString(start, timeZone),
          minutes,
          title: ev.title,
          detail: `${formatMinute(minuteOfDay(start, timeZone))}–${formatMinute(minuteOfDay(end, timeZone))}`,
          companyId: null,
          projectId: null,
        });
      }
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

function minuteOfDay(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}
