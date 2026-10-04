// Shifts module — what happened to a shift that someone needs to hear about. shiftService.ts
// returns these from every write instead of notifying inline, so the write itself stays a plain
// DB operation and the route decides when to deliver (after the response data is ready, awaited —
// Vercel kills un-awaited work).
//
// Delivery (in-app notification, email with .ics, Google Calendar event) is Unidad 4
// (spec-shifts.md). Until then dispatchShiftEvents is deliberately a no-op.

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
  assignmentId: string | null;
  employeeId: string;
  // The one-click accept/decline token for the email link — present only on 'assigned' and
  // 'reconfirm', the only moment it exists in clear (only its hash is stored).
  responseToken?: string;
}

export async function dispatchShiftEvents(events: ShiftEvent[]): Promise<void> {
  void events; // Unidad 4.
}
