import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from './tools.js';
import { apiError, compact, confirmable, data, respond } from './toolHelpers.js';

// Shifts & Timesheets tools (spec-mcp-server.md §10). The Private API hands these calls to the app's
// own Shifts/Timesheet routes as the connected person, so who can see or schedule what (location
// managers, direct managers, everyone's own shifts) is exactly what the app does. By design an
// assistant only prepares DRAFT shifts: publishing a week and cancelling or changing a published
// shift notify people, so those stay in the app.

const isoDate = z.string().describe('Calendar date, YYYY-MM-DD');
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM, 24-hour').describe('Local time HH:MM (24h)');
const confirmationArg = z.string().optional().describe('Only on the second call, after the user explicitly confirmed');

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

function minutes(time: string | undefined): number | undefined {
  if (time === undefined) return undefined;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function registerShiftTools(server: McpServer, ctx: ToolContext): void {
  const { api } = ctx;

  // ---------- Shifts ----------

  server.registerTool('list_locations', {
    title: 'List locations',
    description: 'Work locations (branches/sites) you can see, with their ids — needed to list or create shifts.',
    annotations: READ,
  }, async () => respond(api.get('/shifts/locations')));

  server.registerTool('list_shifts', {
    title: 'List shifts',
    description: 'The schedule between two dates: published shifts at locations you can see, plus drafts where you schedule. Optionally one location.',
    inputSchema: { from: isoDate, to: isoDate, locationId: z.string().optional() },
    annotations: READ,
  }, async ({ from, to, locationId }) => respond(api.get('/shifts', { from, to, locationId })));

  server.registerTool('my_shifts', {
    title: 'My shifts',
    description: "The connected person's own shifts between two dates, with their assignment (to accept or decline).",
    inputSchema: { from: isoDate, to: isoDate },
    annotations: READ,
  }, async ({ from, to }) => respond(api.get('/shifts/mine', { from, to })));

  server.registerTool('create_shift_draft', {
    title: 'Create draft shift',
    description: 'Create a DRAFT shift at a location you schedule. Nobody is notified until someone publishes the week in the app.',
    inputSchema: {
      locationId: z.string(),
      date: isoDate,
      start: clock,
      end: clock.describe('Local time HH:MM (24h); earlier than start means it ends the next day'),
      position: z.string().optional().describe('Role for the shift, e.g. "Cashier"'),
      headcount: z.number().int().min(1).optional().describe('People needed, default 1'),
      notes: z.string().optional(),
    },
    annotations: WRITE,
  }, async ({ start, end, ...rest }) =>
    respond(api.post('/shifts', compact({ ...rest, startMinute: minutes(start), endMinute: minutes(end) })), 'Draft shift created.'));

  server.registerTool('update_shift_draft', {
    title: 'Update draft shift',
    description: 'Change a DRAFT shift (published shifts can only be changed in the app).',
    inputSchema: {
      id: z.string(),
      date: isoDate.optional(),
      start: clock.optional(),
      end: clock.optional(),
      position: z.string().nullable().optional(),
      headcount: z.number().int().min(1).optional(),
      notes: z.string().nullable().optional(),
    },
    annotations: WRITE,
  }, async ({ id, start, end, ...rest }) =>
    respond(api.patch(`/shifts/${id}`, compact({ ...rest, startMinute: minutes(start), endMinute: minutes(end) })), 'Draft shift updated.'));

  server.registerTool('delete_shift_draft', {
    title: 'Delete draft shift',
    description: 'Delete a DRAFT shift. Two steps: first call returns a summary and confirmationToken; call again with it after the user confirms.',
    inputSchema: { id: z.string(), from: isoDate.describe('Any date range containing the shift, to look it up'), to: isoDate, confirmationToken: confirmationArg },
    annotations: DESTRUCTIVE,
  }, async ({ id, from, to, confirmationToken }) => confirmable(ctx, 'delete_shift_draft', id, confirmationToken,
    async () => {
      const list = await api.get<any[]>('/shifts', { from, to });
      if (!list.ok) return list;
      const shift = list.body.find((s) => s.id === id);
      return shift ? { ok: true, status: 200, body: shift } : { ok: false, status: 404, body: { error: 'Shift not found in that range', code: 'not_found' } };
    },
    (s) => `You are about to delete the draft shift on ${s.date} (${s.position ?? 'no position'}).`,
    () => api.delete(`/shifts/${id}`), 'Draft shift deleted.'));

  server.registerTool('shift_candidates', {
    title: 'Who can take a shift',
    description: 'Everyone who could work a given shift, each with blockers (time off, overlapping shift, missing skill) and warnings (availability, hours). Use it to answer "who is free" questions: create a draft for the slot first if needed.',
    inputSchema: { id: z.string().describe('Shift id') },
    annotations: READ,
  }, async ({ id }) => respond(api.get(`/shifts/${id}/candidates`)));

  server.registerTool('assign_to_shift_draft', {
    title: 'Assign people to a draft shift',
    description: 'Put people on a DRAFT shift. If there are warnings (e.g. outside their availability) it refuses with details unless force=true — show them to the user before forcing. Blockers always refuse.',
    inputSchema: { id: z.string(), employeeIds: z.array(z.string()).min(1), force: z.boolean().optional() },
    annotations: WRITE,
  }, async ({ id, employeeIds, force }) => respond(api.post(`/shifts/${id}/assignments`, compact({ employeeIds, force })), 'Assigned.'));

  server.registerTool('respond_to_shift', {
    title: 'Accept or decline my shift',
    description: "Accept or decline one of the connected person's own assignments (assignmentId from my_shifts). Declining needs a reason if the company requires it.",
    inputSchema: { assignmentId: z.string(), response: z.enum(['accepted', 'declined']), reason: z.string().optional() },
    annotations: WRITE,
  }, async ({ assignmentId, response, reason }) => respond(api.post(`/shifts/assignments/${assignmentId}/respond`, compact({ response, reason })), `Shift ${response}.`));

  server.registerTool('my_availability', {
    title: 'My availability',
    description: "The connected person's saved availability (weekly patterns and specific dates).",
    annotations: READ,
  }, async () => respond(api.get('/shifts/availability')));

  // ---------- Timesheets ----------

  server.registerTool('my_timesheet', {
    title: 'My timesheet',
    description: "A week of the connected person's logged hours (default: this week): entries, status (open/submitted/approved/returned), planned vs logged vs billable minutes, and suggestions not logged yet.",
    inputSchema: { weekStart: isoDate.optional().describe('Any date in the week') },
    annotations: READ,
  }, async ({ weekStart }) => respond(api.get('/timesheets', { weekStart })));

  server.registerTool('get_timesheet', {
    title: "Someone's timesheet",
    description: "A week of another person's hours — only if you approve their timesheets (their manager, or a role that approves timesheets).",
    inputSchema: { employeeId: z.string(), weekStart: isoDate.optional() },
    annotations: READ,
  }, async ({ employeeId, weekStart }) => respond(api.get('/timesheets', { employeeId, weekStart })));

  server.registerTool('log_time', {
    title: 'Log time',
    description: 'Add time to your own timesheet for a day (the week must be open or returned). Optionally link a client company and/or project; billable needs the Growth plan.',
    inputSchema: {
      date: isoDate,
      minutes: z.number().int().min(1).max(1440).describe('e.g. 90 for 1h 30m'),
      description: z.string().optional(),
      billable: z.boolean().optional(),
      companyId: z.string().optional(),
      projectId: z.string().optional(),
    },
    annotations: WRITE,
  }, async (input) => respond(api.post('/timesheets/entries', compact(input)), 'Time logged.'));

  server.registerTool('update_time_entry', {
    title: 'Update time entry',
    description: 'Change one of your own time entries (week must be open or returned).',
    inputSchema: {
      id: z.string(),
      date: isoDate.optional(),
      minutes: z.number().int().min(1).max(1440).optional(),
      description: z.string().optional(),
      billable: z.boolean().optional(),
      companyId: z.string().nullable().optional(),
      projectId: z.string().nullable().optional(),
    },
    annotations: WRITE,
  }, async ({ id, ...rest }) => respond(api.patch(`/timesheets/entries/${id}`, compact(rest)), 'Time entry updated.'));

  server.registerTool('delete_time_entry', {
    title: 'Delete time entry',
    description: 'Delete one of your own time entries. Two steps: first call returns a confirmationToken; call again with it after the user confirms.',
    inputSchema: { id: z.string(), confirmationToken: confirmationArg },
    annotations: DESTRUCTIVE,
  }, async ({ id, confirmationToken }) => confirmable(ctx, 'delete_time_entry', id, confirmationToken,
    async () => ({ ok: true, status: 200, body: { id } }),
    () => 'You are about to delete this time entry from your timesheet.',
    () => api.delete(`/timesheets/entries/${id}`), 'Time entry deleted.'));

  server.registerTool('submit_timesheet', {
    title: 'Submit my timesheet',
    description: 'Send your week for approval (your approver is notified). Confirm with the user first.',
    inputSchema: { weekStart: isoDate.describe('Any date in the week to submit') },
    annotations: WRITE,
  }, async ({ weekStart }) => respond(api.post('/timesheets/submit', { weekStart }), 'Timesheet submitted.'));

  server.registerTool('timesheets_to_approve', {
    title: 'Timesheets to approve',
    description: 'Submitted weeks waiting for your decision.',
    annotations: READ,
  }, async () => respond(api.get('/timesheets/approvals')));

  server.registerTool('decide_timesheet', {
    title: 'Approve or return a timesheet',
    description: 'Approve a submitted week, or return it to the person with a note (required when returning). Two steps: first call returns a summary and confirmationToken; call again with it after the user confirms.',
    inputSchema: {
      timesheetId: z.string(),
      decision: z.enum(['approve', 'return']),
      note: z.string().optional(),
      confirmationToken: confirmationArg,
    },
    annotations: DESTRUCTIVE,
  }, async ({ timesheetId, decision, note, confirmationToken }) => confirmable(ctx, `decide_timesheet:${decision}`, timesheetId, confirmationToken,
    async () => {
      const pending = await api.get<any>('/timesheets/approvals');
      if (!pending.ok) return pending;
      const rows: any[] = Array.isArray(pending.body) ? pending.body : (pending.body?.items ?? pending.body?.timesheets ?? []);
      const week = rows.find((r) => r.timesheetId === timesheetId || r.id === timesheetId);
      return week ? { ok: true, status: 200, body: week } : { ok: false, status: 404, body: { error: 'Not a submitted week waiting for you', code: 'not_found' } };
    },
    (w) => `You are about to ${decision === 'approve' ? 'APPROVE' : 'RETURN'} the week of ${w.weekStart ?? ''} for ${w.employee?.firstName ?? ''} ${w.employee?.lastName ?? ''}.`,
    () => api.post(`/timesheets/${timesheetId}/decision`, compact({ decision, note })), decision === 'approve' ? 'Timesheet approved.' : 'Timesheet returned.'));

  server.registerTool('hours_summary', {
    title: 'Hours summary',
    description: 'Logged hours between two dates grouped by person, client company or project, with billable vs non-billable (for people who approve timesheets). Max one year.',
    inputSchema: { from: isoDate, to: isoDate, groupBy: z.enum(['person', 'company', 'project']).optional() },
    annotations: READ,
  }, async ({ from, to, groupBy }) => {
    const result = await api.get('/timesheets/reports', { from, to, groupBy });
    return result.ok ? data(result.body) : apiError(result);
  });
}
