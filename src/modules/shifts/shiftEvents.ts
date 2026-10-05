// Shifts module — what happened to a shift that someone needs to hear about. shiftService.ts
// returns these from every write instead of notifying inline, so the write itself stays a plain
// DB operation; the route then delivers them with shiftNotifier.ts's dispatchShiftEvents (awaited
// — Vercel kills un-awaited work).

export type ShiftEventKind =
  | 'assigned' // published to the assignee, or assigned to an already-published shift
  | 'reconfirm' // time/date/location changed on a published shift: answer again
  | 'changed' // a change that doesn't need re-confirming (position, notes, headcount)
  | 'unassigned' // taken off a published shift
  | 'cancelled' // the published shift was cancelled
  | 'declined'; // to the people who manage the shift: an assignee can't make it

export interface ShiftEvent {
  kind: ShiftEventKind;
  tenantId: string;
  shiftId: string;
  // For 'unassigned' this is the id of the assignment that was just deleted (kept for the .ics UID).
  assignmentId: string | null;
  employeeId: string;
  // The one-click accept/decline token for the email link — present only on 'assigned' and
  // 'reconfirm', the only moment it exists in clear (only its hash is stored).
  responseToken?: string;
  // 'unassigned' only: the assignment (and its ShiftCalendarSync rows) is already deleted when
  // delivery runs, so the Google events to remove travel with the event.
  calendarEvents?: { userId: string; googleCalendarEventId: string }[];
}
