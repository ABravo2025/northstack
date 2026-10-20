import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from './tools.js';
import { compact, confirmable, respond } from './toolHelpers.js';

// Scheduling extras (2026-10-20), on top of shiftTools.ts: publishing, cancelling and copying weeks
// (they notify people — approved by Alejandro as "avisos a terceros", always confirmed first),
// costs, skills/templates, open shifts and swaps, availability, timesheet extras, client hour
// reports and clock in/out (approved the same day). The Private API runs the app's own routes as
// the connected person, so location managers, direct managers and the person's own rules apply.

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;
const isoDate = z.string().describe('Calendar date, YYYY-MM-DD');
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM, 24-hour').describe('Local time HH:MM (24h)');
const confirmationArg = z.string().optional().describe('Only on the second call, after the user explicitly confirmed');

function minutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function registerSchedulingTools(server: McpServer, ctx: ToolContext): void {
  const { api } = ctx;

  // ---------- Publishing and cancelling (notify people) ----------

  server.registerTool('publish_shifts', {
    title: 'Publish shifts',
    description:
      'Publish DRAFT shifts: the people on them are notified and asked to accept. Two steps: first call returns a summary and confirmationToken; call again with it after the user confirms.',
    inputSchema: { shiftIds: z.array(z.string()).min(1), confirmationToken: confirmationArg },
    annotations: DESTRUCTIVE,
  }, async ({ shiftIds, confirmationToken }) => confirmable(ctx, 'publish_shifts', [...shiftIds].sort().join(','), confirmationToken,
    async () => ({ ok: true, status: 200, body: { count: shiftIds.length } }),
    ({ count }) => `You are about to PUBLISH ${count} shift(s). Everyone assigned will be notified (e-mail / app) and asked to accept.`,
    () => api.post('/shifts/publish', { shiftIds }), 'Shifts published.'));

  server.registerTool('cancel_shift', {
    title: 'Cancel shift',
    description:
      'Cancel a PUBLISHED shift; the people on it are notified. (Draft shifts: delete_shift_draft.) Two steps: first call returns a summary and confirmationToken; call again with it after the user confirms.',
    inputSchema: { id: z.string(), from: isoDate.describe('Any date range containing the shift, to look it up'), to: isoDate, confirmationToken: confirmationArg },
    annotations: DESTRUCTIVE,
  }, async ({ id, from, to, confirmationToken }) => confirmable(ctx, 'cancel_shift', id, confirmationToken,
    async () => {
      const list = await api.get<any>('/shifts', { from, to });
      if (!list.ok) return list;
      const shifts: any[] = Array.isArray(list.body) ? list.body : (list.body?.shifts ?? []);
      const shift = shifts.find((s) => s.id === id);
      return shift ? { ok: true, status: 200, body: shift } : { ok: false, status: 404, body: { error: 'Shift not found in that range', code: 'not_found' } };
    },
    (s) => `You are about to CANCEL the shift on ${s.date} (${s.position ?? 'no position'}). The people assigned will be notified.`,
    () => api.post(`/shifts/${id}/cancel`, {}), 'Shift cancelled.'));

  server.registerTool('copy_shift_week', {
    title: 'Copy a week of shifts',
    description: "Copy one week's shifts into another week as DRAFTS (nobody is notified until they're published). Optionally one location. Weeks are given by their first day.",
    inputSchema: { fromWeekStart: isoDate, toWeekStart: isoDate, locationId: z.string().optional() },
    annotations: WRITE,
  }, async (input) => respond(api.post('/shifts/copy-week', compact(input)), 'Week copied as drafts.'));

  // ---------- Planning reference ----------

  server.registerTool('shift_cost', {
    title: 'Shift labor cost',
    description: 'Estimated labor cost of the schedule between two dates (from compensations), optionally for one location. Needs payroll-level access.',
    inputSchema: { from: isoDate, to: isoDate, locationId: z.string().optional() },
    annotations: READ,
  }, async (input) => respond(api.get('/shifts/cost', compact(input))));

  server.registerTool('shift_reference', {
    title: 'Shift skills and templates',
    description: 'Skills (and who holds them, with expiry) or saved shift templates. Read-only: they are set up in Settings.',
    inputSchema: { view: z.enum(['skills', 'templates']) },
    annotations: READ,
  }, async ({ view }) => respond(api.get(view === 'skills' ? '/shifts/skills' : '/shifts/templates')));

  // ---------- Open shifts, giving away, swaps ----------

  server.registerTool('shift_marketplace', {
    title: 'Open shifts and requests',
    description:
      'view="open": open shifts you could claim. view="my_requests": your give-away/swap requests and ones sent to you. view="to_decide": requests waiting for you as a manager. view="swap_targets": shifts you could swap one of yours (assignmentId) with.',
    inputSchema: { view: z.enum(['open', 'my_requests', 'to_decide', 'swap_targets']), assignmentId: z.string().optional() },
    annotations: READ,
  }, async ({ view, assignmentId }) => {
    if (view === 'open') return respond(api.get('/shifts/available'));
    if (view === 'swap_targets') {
      if (!assignmentId) return { isError: true, content: [{ type: 'text', text: 'assignmentId is required (my_shifts).' }] };
      return respond(api.get(`/shifts/assignments/${assignmentId}/swap-targets`));
    }
    return respond(api.get('/shifts/requests', view === 'to_decide' ? { scope: 'manage' } : {}));
  });

  server.registerTool('shift_request_action', {
    title: 'Act on open shifts and swaps',
    description:
      'claim (an open shift: shiftId) · give_away (your assignmentId, reason) · swap (your assignmentId with targetAssignmentId, reason) · take (someone\'s give-away: requestId) · answer (a swap sent to you: requestId, accept) · decide (as manager: requestId, approve, note) · cancel (your request: requestId) · open (as scheduler, offer a shift to anyone: shiftId, open true/false). People involved are notified.',
    inputSchema: {
      action: z.enum(['claim', 'give_away', 'swap', 'take', 'answer', 'decide', 'cancel', 'open']),
      shiftId: z.string().optional(),
      assignmentId: z.string().optional(),
      targetAssignmentId: z.string().optional(),
      requestId: z.string().optional(),
      accept: z.boolean().optional(),
      approve: z.boolean().optional(),
      open: z.boolean().optional(),
      reason: z.string().optional(),
      note: z.string().optional(),
    },
    annotations: WRITE,
  }, async (input) => {
    const need = (value: string | undefined, name: string) => (value ? null : { isError: true, content: [{ type: 'text' as const, text: `${name} is required for ${input.action}.` }] });
    switch (input.action) {
      case 'claim': return need(input.shiftId, 'shiftId') ?? respond(api.post(`/shifts/${input.shiftId}/claim`, {}), 'Shift claimed.');
      case 'open': return need(input.shiftId, 'shiftId') ?? respond(api.post(`/shifts/${input.shiftId}/open`, { open: input.open ?? true }), 'Done.');
      case 'give_away': return need(input.assignmentId, 'assignmentId') ?? respond(api.post(`/shifts/assignments/${input.assignmentId}/give`, compact({ reason: input.reason })), 'Offered to others.');
      case 'swap': return need(input.assignmentId, 'assignmentId') ?? need(input.targetAssignmentId, 'targetAssignmentId') ??
        respond(api.post(`/shifts/assignments/${input.assignmentId}/swap`, compact({ targetAssignmentId: input.targetAssignmentId, reason: input.reason })), 'Swap requested.');
      case 'take': return need(input.requestId, 'requestId') ?? respond(api.post(`/shifts/requests/${input.requestId}/take`, {}), 'Shift taken.');
      case 'answer': return need(input.requestId, 'requestId') ?? respond(api.post(`/shifts/requests/${input.requestId}/answer`, { accept: input.accept ?? false }), 'Answered.');
      case 'decide': return need(input.requestId, 'requestId') ?? respond(api.post(`/shifts/requests/${input.requestId}/decide`, compact({ approve: input.approve ?? false, note: input.note })), 'Decided.');
      default: return need(input.requestId, 'requestId') ?? respond(api.post(`/shifts/requests/${input.requestId}/cancel`, {}), 'Request cancelled.');
    }
  });

  // ---------- Availability ----------

  server.registerTool('set_availability', {
    title: 'Set my availability',
    description: 'Add an availability rule for the connected person: weekly (weekday 0=Sunday … 6=Saturday) or for one date, as available or unavailable, between two times.',
    inputSchema: {
      weekday: z.number().int().min(0).max(6).optional(),
      date: isoDate.optional(),
      start: clock,
      end: clock.describe('Local time HH:MM (24h); use 24:00 for midnight').or(z.literal('24:00')),
      kind: z.enum(['available', 'unavailable']),
      note: z.string().optional(),
    },
    annotations: WRITE,
  }, async ({ start, end, ...rest }) => respond(api.post('/shifts/availability', compact({ ...rest, startMinute: minutes(start), endMinute: minutes(end) })), 'Availability saved.'));

  server.registerTool('delete_availability', {
    title: 'Delete my availability rule',
    description: 'Remove one of the connected person\'s availability rules (id from my_availability).',
    inputSchema: { id: z.string() },
    annotations: WRITE,
  }, async ({ id }) => respond(api.delete(`/shifts/availability/${id}`), 'Availability rule removed.'));

  // ---------- Timesheet extras ----------

  server.registerTool('reopen_timesheet', {
    title: 'Reopen timesheet',
    description: 'As the approver, reopen an approved timesheet so it can be corrected (the person is notified).',
    inputSchema: { timesheetId: z.string(), reason: z.string().min(1) },
    annotations: WRITE,
  }, async ({ timesheetId, reason }) => respond(api.post(`/timesheets/${timesheetId}/reopen`, { reason }), 'Timesheet reopened.'));

  server.registerTool('timesheet_adjustment', {
    title: 'Adjust a closed timesheet',
    description: 'Add a correction (positive or negative minutes, with a reason) to one of your own already-approved timesheets; it goes to your approver.',
    inputSchema: { timesheetId: z.string(), minutes: z.number().int().refine((m) => m !== 0, 'Not zero'), reason: z.string().min(1), description: z.string().optional() },
    annotations: WRITE,
  }, async ({ timesheetId, ...input }) => respond(api.post(`/timesheets/${timesheetId}/adjustments`, compact(input)), 'Adjustment added.'));

  server.registerTool('timesheet_suggestion', {
    title: 'Dismiss or restore a timesheet suggestion',
    description: 'Hide (dismiss) or bring back (restore) one of the suggested time entries in your timesheet (from a shift, task, meeting or calendar event).',
    inputSchema: { action: z.enum(['dismiss', 'restore']), sourceType: z.enum(['shift', 'task', 'meeting', 'calendar']), sourceId: z.string() },
    annotations: WRITE,
  }, async ({ action, ...input }) => respond(api.post(`/timesheets/suggestions/${action}`, input), action === 'dismiss' ? 'Suggestion dismissed.' : 'Suggestion restored.'));

  // ---------- Client hour reports ----------

  server.registerTool('send_client_report', {
    title: 'Client hours report',
    description:
      'Create a shareable report of the hours worked for a client company (optionally one project) in a period, and optionally e-mail it with a PDF to the client (email). Without email it just returns the link. Two steps when emailing: first call returns a summary and confirmationToken; call again with it after the user confirms.',
    inputSchema: {
      companyId: z.string(),
      projectId: z.string().optional(),
      from: isoDate,
      to: isoDate,
      showPeople: z.boolean().optional().describe('Show who worked (default true)'),
      email: z.string().email().optional().describe("Client's e-mail; the company's primary contact is a good default"),
      lang: z.enum(['en', 'es']).optional(),
      confirmationToken: confirmationArg,
    },
    annotations: DESTRUCTIVE,
  }, async ({ confirmationToken, ...input }) => {
    const send = () => api.post('/shifts/client-reports', compact(input));
    if (!input.email) return respond(send(), 'Report link created.');
    return confirmable(ctx, `send_client_report:${input.email}:${input.from}:${input.to}`, input.companyId, confirmationToken,
      // A shift manager may not see CRM companies: fall back to the id rather than failing.
      async () => {
        const company = await api.get<any>(`/crm/companies/${input.companyId}`);
        return company.ok ? company : { ok: true, status: 200, body: { name: input.companyId } };
      },
      (c) => `You are about to e-mail the hours report for "${c.name}" (${input.from} to ${input.to}) to ${input.email}, outside the company.`,
      send, 'Report e-mailed.');
  });

  // ---------- Clock in/out (approved 2026-10-20) ----------

  server.registerTool('clock_status', {
    title: 'My clock status',
    description: "The connected person's clock: whether they're clocked in (since when, at which location), on a break, and today's entries.",
    annotations: READ,
  }, async () => respond(api.get('/clock/me')));

  server.registerTool('clock_action', {
    title: 'Clock in / out / break',
    description:
      'Clock the CONNECTED PERSON in (locationId; list_locations) or out, or start/end a break. Always your own attendance — never someone else\'s. Locations that require being on site refuse it here: use the app there.',
    inputSchema: {
      action: z.enum(['in', 'out', 'break_start', 'break_end']),
      locationId: z.string().optional().describe('Clock in only'),
      breakMinutes: z.number().int().min(0).max(720).optional().describe('Clock out only: break taken, if not tracked'),
    },
    annotations: WRITE,
  }, async ({ action, locationId, breakMinutes }) => {
    if (action === 'in') return respond(api.post('/clock/in', compact({ locationId })), 'Clocked in.');
    if (action === 'out') return respond(api.post('/clock/out', compact({ breakMinutes })), 'Clocked out.');
    return respond(api.post(`/clock/break/${action === 'break_start' ? 'start' : 'end'}`, {}), action === 'break_start' ? 'Break started.' : 'Break ended.');
  });

  server.registerTool('clock_board', {
    title: 'Clock board',
    description: "For managers of a location: who is clocked in now, who is late or missing, and entries waiting for review. Optionally one location.",
    inputSchema: { locationId: z.string().optional() },
    annotations: READ,
  }, async ({ locationId }) => respond(api.get('/clock/board', compact({ locationId }))));

  server.registerTool('correct_clock_entry', {
    title: 'Correct a clock entry',
    description:
      "For a location's manager: fix someone's clock entry (times, break) or mark it reviewed, always with a reason (kept in the entry's history, see history=true). The person sees the correction.",
    inputSchema: {
      entryId: z.string(),
      history: z.boolean().optional().describe('true: only read the corrections history'),
      clockInAt: z.string().optional().describe('ISO 8601 date-time'),
      clockOutAt: z.string().optional().describe('ISO 8601 date-time'),
      breakMinutes: z.number().int().min(0).max(720).optional(),
      markReviewed: z.boolean().optional(),
      reason: z.string().optional().describe('Required to change anything'),
    },
    annotations: WRITE,
  }, async ({ entryId, history, ...input }) => {
    if (history) return respond(api.get(`/clock/entries/${entryId}/corrections`));
    return respond(api.patch(`/clock/entries/${entryId}`, compact(input)), 'Clock entry corrected.');
  });
}
