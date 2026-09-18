// A stored dueDate is either date-only (always exactly UTC midnight, TaskForm.tsx's convention)
// or a real instant. Reading exact-midnight-UTC back with the viewer's *local* getters shifts the
// displayed day back by one for any timezone west of UTC — same bug class OverviewPage.tsx's
// taskDueDateKey already guards against for the calendar grid. This normalizes either shape to a
// local Date representing the intended calendar day, so every helper below only has to compare/
// format local dates.
function toLocalCalendarDate(iso: string): Date {
  const d = new Date(iso);
  const hasTime = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0 || d.getUTCSeconds() !== 0;
  return hasTime ? d : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// Short "Sep 12" style date, matching the My Tasks hub's compact date columns (List header +
// Board cards) — deliberately terser than MyTasksWidget.tsx's formatDueDate, which also shows a
// time-of-day for timed tasks; the hub's columns are too narrow for that.
export function formatHubDate(iso: string): string {
  return toLocalCalendarDate(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function isOverdue(dueDateIso: string | null): boolean {
  if (!dueDateIso) return false;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return toLocalCalendarDate(dueDateIso).getTime() < startOfToday.getTime();
}

export type TaskBoardBucket = 'overdue' | 'today' | 'week' | 'later' | 'nodate' | 'completed';

export function bucketForTask(dueDate: string | null, completedAt: string | null): TaskBoardBucket {
  if (completedAt) return 'completed';
  if (!dueDate) return 'nodate';
  if (isOverdue(dueDate)) return 'overdue';
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setHours(23, 59, 59, 999);
  const due = toLocalCalendarDate(dueDate);
  if (due <= endOfToday) return 'today';
  const weekAhead = new Date(startOfToday);
  weekAhead.setDate(weekAhead.getDate() + 7);
  return due <= weekAhead ? 'week' : 'later';
}

// Dragging a Board card into a date-bucket column has to pick *some* concrete date for buckets
// that span a range ("This week", "Later") — there's no single right answer, so this picks a
// simple, documented default (a card dropped in a bucket can always be fine-tuned afterward via
// the detail modal's real date field). Dropping on "Overdue" is rejected outright: a task can only
// become overdue by its due date lapsing, never by a manual drag.
export function resolveBoardMove(bucket: TaskBoardBucket): { dueDate?: string | null; completedAt?: string | null } | null {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  switch (bucket) {
    case 'overdue':
      return null;
    case 'today':
      return { dueDate: startOfToday.toISOString(), completedAt: null };
    case 'week': {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() + 3);
      return { dueDate: d.toISOString(), completedAt: null };
    }
    case 'later': {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() + 14);
      return { dueDate: d.toISOString(), completedAt: null };
    }
    case 'nodate':
      return { dueDate: null, completedAt: null };
    case 'completed':
      return { completedAt: new Date().toISOString() };
    default:
      return null;
  }
}
