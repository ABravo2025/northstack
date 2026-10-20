import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PrivateApiClient } from './privateApiClient.js';
import { apiError, compact, confirmable, data, message, respond } from './toolHelpers.js';
import { registerShiftTools } from './shiftTools.js';
import { registerSchedulingTools } from './schedulingTools.js';
import { registerWorkspaceTools } from './workspaceTools.js';
import { registerRecordTools } from './recordTools.js';
import { registerHrTools } from './hrTools.js';
import { registerProjectTools } from './projectTools.js';

// The MCP tool catalog (spec-mcp-server.md §5). Every tool is a thin wrapper over one or a few
// Private API calls; none of them decides what the user may do — the Private API applies the
// connected user's role to every call, so a tool for something the role can't do just returns
// that 403 as a readable error. Descriptions are in English on purpose: the model reads them.
// Destructive tools (delete/deactivate/decide) never act on the first call — see confirmation.ts.

export interface ToolContext {
  api: PrivateApiClient;
  // Keys the confirmation-token HMAC — the caller's own bearer token (confirmation.ts).
  confirmationSecret: string;
}

export const ENTITY_TYPES = ['employee', 'company', 'contact', 'opportunity', 'project'] as const;

const pageArgs = {
  cursor: z.string().optional().describe('nextCursor from a previous page'),
  limit: z.number().int().min(1).max(100).optional().describe('Page size, default 25'),
};

const isoDateTime = z.string().describe('ISO 8601 date-time, e.g. 2026-11-02T15:00:00Z');
const isoDate = z.string().describe('Calendar date, YYYY-MM-DD');
const confirmationArg = z.string().optional().describe('Only on the second call, after the user explicitly confirmed');

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function registerTools(server: McpServer, ctx: ToolContext): void {
  const { api } = ctx;
  const list = (path: string, query: Record<string, string | number | undefined>, cursor?: string, limit?: number) =>
    respond(api.get(path, { ...query, cursor, limit: limit ?? 25 }));

  // ---------- Context ----------

  server.registerTool('whoami', {
    title: 'Who am I',
    description: "Who you're acting as in Northstack: the user, their role, the workspace and plan, and which areas this connection can read or write (scopes). user.employeeId is your own employee record (null if not linked). Call this first if unsure what's allowed.",
    annotations: READ,
  }, async () => respond(api.get('/me')));

  server.registerTool('my_day', {
    title: 'My day',
    description: "The connected user's open tasks split into overdue, due today and due in the next 7 days, plus who in the team is off today.",
    annotations: READ,
  }, async () => {
    const [tasks, off] = await Promise.all([
      api.getAll<any>('/tasks', { assigneeId: 'me', status: 'open' }),
      api.getAll<any>('/hr/timeoff', { scope: 'calendar', status: 'approved', from: todayIso(), to: todayIso() }),
    ]);
    if (!tasks.ok) return apiError(tasks);
    const now = Date.now();
    const endOfToday = new Date(`${todayIso()}T23:59:59.999Z`).getTime();
    const inAWeek = now + 7 * 86_400_000;
    const due = (t: any) => (t.dueDate ? new Date(t.dueDate).getTime() : null);
    const slim = (t: any) => ({ id: t.id, title: t.title, dueDate: t.dueDate, entityType: t.entityType, entityId: t.entityId });
    return data({
      overdue: tasks.body.filter((t) => (due(t) ?? Infinity) < now).map(slim),
      dueToday: tasks.body.filter((t) => { const d = due(t); return d !== null && d >= now && d <= endOfToday; }).map(slim),
      dueThisWeek: tasks.body.filter((t) => { const d = due(t); return d !== null && d > endOfToday && d <= inAWeek; }).map(slim),
      noDueDate: tasks.body.filter((t) => due(t) === null).length,
      offToday: off.ok ? off.body.map((r: any) => ({ employee: r.employee, policy: r.timeOffPolicy?.name, until: r.endDate })) : 'not available',
    });
  });

  // ---------- Tasks ----------

  server.registerTool('search_tasks', {
    title: 'Search tasks',
    description: 'List tasks. Filter by text, assignee ("me" for the connected user), status, the record a task is attached to, or a due-date cutoff.',
    inputSchema: {
      q: z.string().optional().describe('Text in title or description'),
      assigneeId: z.string().optional().describe('"me" or a user id'),
      status: z.enum(['open', 'completed', 'all']).optional(),
      entityType: z.enum(ENTITY_TYPES).optional(),
      entityId: z.string().optional(),
      dueBefore: isoDateTime.optional(),
      ...pageArgs,
    },
    annotations: READ,
  }, async ({ cursor, limit, ...filters }) => list('/tasks', filters, cursor, limit));

  server.registerTool('get_task', {
    title: 'Get task',
    description: 'One task by id.',
    inputSchema: { id: z.string() },
    annotations: READ,
  }, async ({ id }) => respond(api.get(`/tasks/${id}`)));

  server.registerTool('create_task', {
    title: 'Create task',
    description: 'Create a task attached to an employee, company, contact, opportunity or project. assigneeId is a USER id: list_users for anyone, whoami for yourself.',
    inputSchema: {
      entityType: z.enum(ENTITY_TYPES),
      entityId: z.string(),
      title: z.string().min(1),
      description: z.string().optional(),
      assigneeId: z.string().describe('User id of the assignee (list_users)'),
      dueDate: isoDateTime.optional(),
      projectPhaseId: z.string().optional().describe("Project tasks only: one of that project's phases (get_project)"),
      folderId: z.string().optional().describe('Personal task folder (list_task_folders)'),
      hasVideoCall: z.boolean().optional().describe('Add a Google Meet link once the task has a due time'),
      meetAttendeeEmail: z.string().email().optional().describe('Who to invite to the call; required for a project task with a call'),
    },
    annotations: WRITE,
  }, async (input) => respond(api.post('/tasks', compact(input)), 'Task created.'));

  server.registerTool('update_task', {
    title: 'Update task',
    description: 'Change a task. To complete it set completed=true (optionally with timeSpentMinutes); to reopen, completed=false. Pass null to clear an optional field.',
    inputSchema: {
      id: z.string(),
      title: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      assigneeId: z.string().optional().describe('User id (list_users)'),
      dueDate: isoDateTime.nullable().optional(),
      completed: z.boolean().optional(),
      timeSpentMinutes: z.number().int().min(0).nullable().optional().describe('Time spent on the task, in minutes'),
      projectPhaseId: z.string().nullable().optional(),
      folderId: z.string().nullable().optional(),
      hasVideoCall: z.boolean().optional(),
      meetAttendeeEmail: z.string().email().nullable().optional(),
    },
    annotations: WRITE,
  }, async ({ id, completed, ...rest }) =>
    respond(api.patch(`/tasks/${id}`, compact({ ...rest, completedAt: completed === undefined ? undefined : completed ? new Date().toISOString() : null })), 'Task updated.'));

  server.registerTool('delete_task', {
    title: 'Delete task',
    description: 'Delete a task. Two steps: the first call only returns a summary and a confirmationToken; call again with it after the user explicitly confirms.',
    inputSchema: { id: z.string(), confirmationToken: confirmationArg },
    annotations: DESTRUCTIVE,
  }, async ({ id, confirmationToken }) => confirmable(ctx, 'delete_task', id, confirmationToken,
    () => api.get(`/tasks/${id}`), (t) => `You are about to delete the task "${t.title}".`,
    () => api.delete(`/tasks/${id}`), 'Task deleted.'));

  // ---------- Notes ----------

  server.registerTool('list_notes', {
    title: 'List notes',
    description: 'Notes, optionally only those on one record (entityType + entityId) or containing some text.',
    inputSchema: { entityType: z.enum(ENTITY_TYPES).optional(), entityId: z.string().optional(), q: z.string().optional(), ...pageArgs },
    annotations: READ,
  }, async ({ cursor, limit, ...filters }) => list('/notes', filters, cursor, limit));

  server.registerTool('create_note', {
    title: 'Create note',
    description: 'Add a note to an employee, company, contact, opportunity or project. Use it for details that have no field of their own.',
    inputSchema: { entityType: z.enum(ENTITY_TYPES), entityId: z.string(), title: z.string().min(1), description: z.string().min(1).describe('The note body') },
    annotations: WRITE,
  }, async (input) => respond(api.post('/notes', input), 'Note created.'));

  server.registerTool('update_note', {
    title: 'Update note',
    description: "Edit a note's title or body.",
    inputSchema: { id: z.string(), title: z.string().min(1).optional(), description: z.string().min(1).optional() },
    annotations: WRITE,
  }, async ({ id, ...rest }) => respond(api.patch(`/notes/${id}`, compact(rest)), 'Note updated.'));

  server.registerTool('delete_note', {
    title: 'Delete note',
    description: 'Delete a note. Two steps: first call returns a summary and confirmationToken; call again with it after the user confirms.',
    inputSchema: { id: z.string(), confirmationToken: confirmationArg },
    annotations: DESTRUCTIVE,
  }, async ({ id, confirmationToken }) => confirmable(ctx, 'delete_note', id, confirmationToken,
    () => api.get(`/notes/${id}`), (n) => `You are about to delete the note "${n.title}".`,
    () => api.delete(`/notes/${id}`), 'Note deleted.'));

  // ---------- CRM: companies ----------

  server.registerTool('search_companies', {
    title: 'Search companies',
    description: 'List companies, optionally by name/website text or account owner ("me").',
    inputSchema: { q: z.string().optional(), accountOwnerId: z.string().optional().describe('"me" or a user id'), ...pageArgs },
    annotations: READ,
  }, async ({ cursor, limit, ...filters }) => list('/crm/companies', filters, cursor, limit));

  server.registerTool('get_company', {
    title: 'Get company',
    description: 'One company by id, with its details.',
    inputSchema: { id: z.string() },
    annotations: READ,
  }, async ({ id }) => respond(api.get(`/crm/companies/${id}`)));

  server.registerTool('create_company', {
    title: 'Create company',
    description:
      'Create a company (account). Every company needs a primary contact: pass contactId for an existing contact (see search_contacts), or contactFirstName + contactLastName + contactEmail to create one with it.',
    inputSchema: {
      name: z.string().min(1),
      contactId: z.string().optional().describe('Existing contact to make primary'),
      contactFirstName: z.string().optional(),
      contactLastName: z.string().optional(),
      contactEmail: z.string().email().optional(),
      industry: z.string().optional(),
      website: z.string().optional(),
      phone: z.string().optional(),
      billingAddress: z.string().optional(),
      accountOwnerId: z.string().optional().describe('User id'),
    },
    annotations: WRITE,
  }, async ({ contactId, contactFirstName, contactLastName, contactEmail, ...rest }) => {
    const contact = contactId
      ? { contactId }
      : contactFirstName && contactLastName && contactEmail
        ? { firstName: contactFirstName, lastName: contactLastName, email: contactEmail }
        : null;
    if (!contact) {
      return message("A company needs a primary contact. Ask the user for an existing contact or the new contact's first name, last name and email, then call again.");
    }
    return respond(api.post('/crm/companies', { ...compact(rest), contact }), 'Company created.');
  });

  server.registerTool('update_company', {
    title: 'Update company',
    description: 'Change a company. Pass null to clear an optional field.',
    inputSchema: {
      id: z.string(),
      name: z.string().min(1).optional(),
      industry: z.string().nullable().optional(),
      website: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      billingAddress: z.string().nullable().optional(),
      accountOwnerId: z.string().nullable().optional(),
      parentCompanyId: z.string().nullable().optional(),
    },
    annotations: WRITE,
  }, async ({ id, ...rest }) => respond(api.patch(`/crm/companies/${id}`, compact(rest)), 'Company updated.'));

  server.registerTool('delete_company', {
    title: 'Delete company',
    description: 'Delete a company. Two steps: first call returns a summary and confirmationToken; call again with it after the user confirms. Linked opportunities are kept unless deleteLinkedOpportunities=true.',
    inputSchema: { id: z.string(), deleteLinkedOpportunities: z.boolean().optional(), confirmationToken: confirmationArg },
    annotations: DESTRUCTIVE,
  }, async ({ id, deleteLinkedOpportunities, confirmationToken }) => confirmable(ctx, `delete_company:${deleteLinkedOpportunities ? 'with_opps' : 'keep_opps'}`, id, confirmationToken,
    () => api.get(`/crm/companies/${id}`),
    (c) => `You are about to delete the company "${c.name}"${deleteLinkedOpportunities ? ' AND its linked opportunities' : ''}.`,
    () => api.delete(`/crm/companies/${id}`, compact({ deleteLinkedOpportunities })), 'Company deleted.'));

  // ---------- CRM: contacts ----------

  server.registerTool('search_contacts', {
    title: 'Search contacts',
    description: 'List contacts, optionally by name/email text or company.',
    inputSchema: { q: z.string().optional(), companyId: z.string().optional(), ...pageArgs },
    annotations: READ,
  }, async ({ cursor, limit, ...filters }) => list('/crm/contacts', filters, cursor, limit));

  server.registerTool('get_contact', {
    title: 'Get contact',
    description: 'One contact by id.',
    inputSchema: { id: z.string() },
    annotations: READ,
  }, async ({ id }) => respond(api.get(`/crm/contacts/${id}`)));

  server.registerTool('create_contact', {
    title: 'Create contact',
    description: 'Create a contact (person at a company).',
    inputSchema: {
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      companyId: z.string().optional(),
      title: z.string().optional().describe('Job title'),
      isPrimary: z.boolean().optional(),
    },
    annotations: WRITE,
  }, async (input) => respond(api.post('/crm/contacts', compact(input)), 'Contact created.'));

  server.registerTool('update_contact', {
    title: 'Update contact',
    description: 'Change a contact. Pass null to clear an optional field.',
    inputSchema: {
      id: z.string(),
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      email: z.string().email().optional(),
      phone: z.string().nullable().optional(),
      companyId: z.string().nullable().optional(),
      title: z.string().nullable().optional(),
      isPrimary: z.boolean().optional(),
    },
    annotations: WRITE,
  }, async ({ id, ...rest }) => respond(api.patch(`/crm/contacts/${id}`, compact(rest)), 'Contact updated.'));

  server.registerTool('deactivate_contact', {
    title: 'Deactivate contact',
    description: 'Deactivate a contact (Northstack never hard-deletes contacts). Two steps: first call returns a summary and confirmationToken; call again with it after the user confirms.',
    inputSchema: { id: z.string(), confirmationToken: confirmationArg },
    annotations: DESTRUCTIVE,
  }, async ({ id, confirmationToken }) => confirmable(ctx, 'deactivate_contact', id, confirmationToken,
    () => api.get(`/crm/contacts/${id}`), (c) => `You are about to deactivate the contact ${c.firstName} ${c.lastName} (${c.email}).`,
    () => api.delete(`/crm/contacts/${id}`), 'Contact deactivated.'));

  // ---------- CRM: opportunities & pipelines ----------

  server.registerTool('list_pipelines', {
    title: 'List pipelines',
    description: 'Sales pipelines with their stages (ids needed to create or move opportunities).',
    annotations: READ,
  }, async () => respond(api.get('/crm/pipelines', { limit: 100 })));

  server.registerTool('search_opportunities', {
    title: 'Search opportunities',
    description: 'List opportunities (deals), optionally by name text, company, pipeline, stage or owner ("me"). Amounts are in cents.',
    inputSchema: {
      q: z.string().optional(),
      companyId: z.string().optional(),
      pipelineId: z.string().optional(),
      stageId: z.string().optional(),
      ownerId: z.string().optional().describe('"me" or a user id'),
      ...pageArgs,
    },
    annotations: READ,
  }, async ({ cursor, limit, ...filters }) => list('/crm/opportunities', filters, cursor, limit));

  server.registerTool('get_opportunity', {
    title: 'Get opportunity',
    description: 'One opportunity by id. amountCents is in cents (12345 = 123.45).',
    inputSchema: { id: z.string() },
    annotations: READ,
  }, async ({ id }) => respond(api.get(`/crm/opportunities/${id}`)));

  server.registerTool('create_opportunity', {
    title: 'Create opportunity',
    description: 'Create an opportunity for a company in a pipeline (see list_pipelines). amountCents is in cents.',
    inputSchema: {
      companyId: z.string(),
      pipelineId: z.string(),
      stageId: z.string().optional().describe('Defaults to the first stage'),
      name: z.string().min(1),
      amountCents: z.number().int().nonnegative(),
      currency: z.string().min(1).describe('ISO code, e.g. USD, ARS'),
      estimatedCloseDate: isoDateTime.optional(),
      ownerId: z.string().optional(),
      nextStepDate: isoDateTime.optional(),
      nextStepNote: z.string().optional(),
    },
    annotations: WRITE,
  }, async (input) => respond(api.post('/crm/opportunities', compact(input)), 'Opportunity created.'));

  server.registerTool('update_opportunity', {
    title: 'Update opportunity',
    description: 'Change an opportunity, including moving it to another stage (stageId). Pass null to clear an optional field.',
    inputSchema: {
      id: z.string(),
      name: z.string().min(1).optional(),
      amountCents: z.number().int().nonnegative().optional(),
      currency: z.string().min(1).optional(),
      pipelineId: z.string().optional(),
      stageId: z.string().optional(),
      estimatedCloseDate: isoDateTime.nullable().optional(),
      ownerId: z.string().nullable().optional(),
      nextStepDate: isoDateTime.nullable().optional(),
      nextStepNote: z.string().nullable().optional(),
      closeNote: z.string().nullable().optional(),
    },
    annotations: WRITE,
  }, async ({ id, ...rest }) => respond(api.patch(`/crm/opportunities/${id}`, compact(rest)), 'Opportunity updated.'));

  server.registerTool('delete_opportunity', {
    title: 'Delete opportunity',
    description: 'Delete an opportunity. Two steps: first call returns a summary and confirmationToken; call again with it after the user confirms.',
    inputSchema: { id: z.string(), confirmationToken: confirmationArg },
    annotations: DESTRUCTIVE,
  }, async ({ id, confirmationToken }) => confirmable(ctx, 'delete_opportunity', id, confirmationToken,
    () => api.get(`/crm/opportunities/${id}`), (o) => `You are about to delete the opportunity "${o.name}" (${(o.amountCents / 100).toFixed(2)} ${o.currency}).`,
    () => api.delete(`/crm/opportunities/${id}`), 'Opportunity deleted.'));

  server.registerTool('pipeline_summary', {
    title: 'Pipeline summary',
    description: 'For each pipeline stage: number of open opportunities and total amount per currency. Optionally one pipeline only.',
    inputSchema: { pipelineId: z.string().optional() },
    annotations: READ,
  }, async ({ pipelineId }) => {
    const [pipelines, opportunities] = await Promise.all([
      api.getAll<any>('/crm/pipelines'),
      api.getAll<any>('/crm/opportunities', { pipelineId }),
    ]);
    if (!pipelines.ok) return apiError(pipelines);
    if (!opportunities.ok) return apiError(opportunities);
    const summary = pipelines.body
      .filter((p) => !pipelineId || p.id === pipelineId)
      .map((p) => ({
        pipeline: p.name,
        id: p.id,
        stages: (p.stages ?? []).map((stage: any) => {
          const inStage = opportunities.body.filter((o) => o.stageId === stage.id && o.isActive !== false);
          const totals: Record<string, number> = {};
          for (const o of inStage) totals[o.currency] = (totals[o.currency] ?? 0) + o.amountCents / 100;
          return { stage: stage.name, id: stage.id, count: inStage.length, totals };
        }),
      }));
    return data(summary);
  });

  // ---------- HR: employees ----------

  server.registerTool('search_employees', {
    title: 'Search employees',
    description: "List employees you're allowed to see, optionally by name/email text, department or manager. Fields hidden for your role come back null.",
    inputSchema: { q: z.string().optional(), departmentId: z.string().optional(), managerId: z.string().optional(), ...pageArgs },
    annotations: READ,
  }, async ({ cursor, limit, ...filters }) => list('/hr/employees', filters, cursor, limit));

  server.registerTool('get_employee', {
    title: 'Get employee',
    description: 'One employee by id, with department, job title, status, manager and assigned time-off policies.',
    inputSchema: { id: z.string() },
    annotations: READ,
  }, async ({ id }) => respond(api.get(`/hr/employees/${id}`)));

  server.registerTool('create_employee', {
    title: 'Create employee',
    description: 'Add an employee record. Department, job title and status ids come from list_catalogs; managerId is an employee id. Afterwards: assign_time_off_policy, invite_employee.',
    inputSchema: {
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email().describe('Work email'),
      departmentId: z.string().optional(),
      jobTitleId: z.string().optional(),
      managerId: z.string().optional().describe('Employee id of the manager'),
      startDate: isoDateTime.optional(),
      birthdate: isoDateTime.optional(),
      personalEmail: z.string().optional(),
      contractType: z.enum(['full_time', 'part_time']).optional().describe('Working-hours type. Other contract details (duration, trial period, place of work) have no field: put them in a note'),
      contractUrl: z.string().url().optional().describe('Link to the signed contract (Drive, Dropbox…) — Northstack stores only the link'),
      personType: z.enum(['employee', 'contractor', 'profile']).optional(),
      nationality: z.string().optional(),
      endDate: isoDateTime.optional().describe('End of contract, if fixed-term'),
      statusId: z.string().optional().describe('Employee status id (list_catalogs kind=employee_statuses); default status if omitted'),
    },
    annotations: WRITE,
  }, async (input) => respond(api.post('/hr/employees', compact(input)), 'Employee created.'));

  server.registerTool('update_employee', {
    title: 'Update employee',
    description: 'Change an employee record, including contract type and link, status and end date. Pass null to clear an optional field. Custom fields: set_custom_field. Time-off policies: assign_time_off_policy.',
    inputSchema: {
      id: z.string(),
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      email: z.string().email().optional(),
      departmentId: z.string().nullable().optional(),
      jobTitleId: z.string().nullable().optional(),
      managerId: z.string().nullable().optional(),
      startDate: isoDateTime.nullable().optional(),
      birthdate: isoDateTime.nullable().optional(),
      personalEmail: z.string().nullable().optional(),
      contractType: z.enum(['full_time', 'part_time']).nullable().optional().describe('Working-hours type. Other contract details have no field: put them in a note'),
      contractUrl: z.string().url().nullable().optional().describe('Link to the signed contract — only the link is stored'),
      personType: z.enum(['employee', 'contractor', 'profile']).nullable().optional(),
      nationality: z.string().nullable().optional(),
      endDate: isoDateTime.nullable().optional(),
      statusId: z.string().optional().describe('Employee status id (list_catalogs kind=employee_statuses). A terminated status cannot be changed back here'),
    },
    annotations: WRITE,
  }, async ({ id, ...rest }) => respond(api.patch(`/hr/employees/${id}`, compact(rest)), 'Employee updated.'));

  server.registerTool('delete_employee', {
    title: 'Delete employee',
    description: 'Permanently delete an employee record. For someone LEAVING do not delete: terminations (final pay, access) are done in the app, never through an assistant. Two steps: first call returns a summary and confirmationToken; call again with it after the user confirms.',
    inputSchema: { id: z.string(), confirmationToken: confirmationArg },
    annotations: DESTRUCTIVE,
  }, async ({ id, confirmationToken }) => confirmable(ctx, 'delete_employee', id, confirmationToken,
    () => api.get(`/hr/employees/${id}`), (e) => `You are about to PERMANENTLY delete the employee ${e.firstName} ${e.lastName} (${e.email}).`,
    () => api.delete(`/hr/employees/${id}`), 'Employee deleted.'));

  // ---------- HR: time off ----------

  server.registerTool('list_time_off', {
    title: 'List time off',
    description: 'Time off requests. view="mine" (default; HR admins see everyone\'s), "team" (your direct reports), "team_calendar" (approved and pending for the whole team), or "to_approve" (waiting for your decision). Optional date window and status.',
    inputSchema: {
      view: z.enum(['mine', 'team', 'team_calendar', 'to_approve']).optional(),
      from: isoDate.optional(),
      to: isoDate.optional(),
      status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
      ...pageArgs,
    },
    annotations: READ,
  }, async ({ view, cursor, limit, ...filters }) => {
    if (view === 'team') {
      // The app's own "My team" view (direct reports) — one unpaginated list, filtered here.
      const result = await api.get<any[]>('/hr/time-off-requests', { scope: 'team' });
      if (!result.ok) return apiError(result);
      const time = (v: unknown) => new Date(String(v)).getTime();
      return data(result.body.filter((r) =>
        (!filters.status || r.status === filters.status) &&
        (!filters.from || time(r.endDate) >= time(filters.from)) &&
        (!filters.to || time(r.startDate) <= time(filters.to))));
    }
    return list('/hr/timeoff', { ...filters, scope: view === 'team_calendar' ? 'calendar' : view === 'to_approve' ? 'pending-approval' : undefined }, cursor, limit);
  });

  server.registerTool('who_is_off', {
    title: 'Who is off',
    description: 'Who in the team has approved time off in a date window (default: today).',
    inputSchema: { from: isoDate.optional(), to: isoDate.optional() },
    annotations: READ,
  }, async ({ from, to }) => {
    const result = await api.getAll<any>('/hr/timeoff', { scope: 'calendar', status: 'approved', from: from ?? todayIso(), to: to ?? from ?? todayIso() });
    if (!result.ok) return apiError(result);
    return data(result.body.map((r) => ({ employee: r.employee, policy: r.timeOffPolicy?.name, startDate: r.startDate, endDate: r.endDate })));
  });

  server.registerTool('request_time_off', {
    title: 'Request time off',
    description: 'Request time off. For yourself, omit employeeId; only HR admins can request for someone else. timeOffPolicyId must be a policy assigned to that person (get_employee shows them; list_time_off_policies lists all). preview_time_off shows the days it would use.',
    inputSchema: {
      timeOffPolicyId: z.string(),
      startDate: isoDate,
      endDate: isoDate,
      note: z.string().optional(),
      employeeId: z.string().optional(),
    },
    annotations: WRITE,
  }, async (input) => respond(api.post('/hr/timeoff', compact(input)), 'Time off requested.'));

  server.registerTool('decide_time_off', {
    title: 'Approve or reject time off',
    description: "Approve or reject a request you're the approver for (find them with list_time_off view=\"to_approve\"). Two steps: first call returns a summary and confirmationToken; call again with it after the user confirms.",
    inputSchema: {
      id: z.string(),
      decision: z.enum(['approved', 'rejected']),
      decisionNote: z.string().optional(),
      confirmationToken: confirmationArg,
    },
    annotations: DESTRUCTIVE,
  }, async ({ id, decision, decisionNote, confirmationToken }) => confirmable(ctx, `decide_time_off:${decision}`, id, confirmationToken,
    async () => {
      const pending = await api.getAll<any>('/hr/timeoff', { scope: 'pending-approval' });
      if (!pending.ok) return pending;
      const request = pending.body.find((r) => r.id === id);
      return request ? { ok: true, status: 200, body: request } : { ok: false, status: 404, body: { error: 'Not a pending request you can decide', code: 'not_found' } };
    },
    (r) => `You are about to ${decision === 'approved' ? 'APPROVE' : 'REJECT'} the time off of ${r.employee?.firstName ?? ''} ${r.employee?.lastName ?? ''} from ${String(r.startDate).slice(0, 10)} to ${String(r.endDate).slice(0, 10)}.`,
    () => api.patch(`/hr/timeoff/${id}`, compact({ status: decision, decisionNote })), `Time off ${decision}.`));

  // ---------- HR: payroll (read-only by design — spec decision 5) ----------

  server.registerTool('list_payroll_runs', {
    title: 'List payroll runs',
    description: 'Payroll runs (read-only — payroll can never be changed through an assistant).',
    inputSchema: pageArgs,
    annotations: READ,
  }, async ({ cursor, limit }) => list('/hr/payroll', {}, cursor, limit));

  server.registerTool('get_payroll_run', {
    title: 'Get payroll run',
    description: 'One payroll run with its per-employee rows (read-only).',
    inputSchema: { id: z.string() },
    annotations: READ,
  }, async ({ id }) => respond(api.get(`/hr/payroll/${id}`)));

  registerShiftTools(server, ctx);
  registerSchedulingTools(server, ctx);
  registerWorkspaceTools(server, ctx);
  registerRecordTools(server, ctx);
  registerHrTools(server, ctx);
  registerProjectTools(server, ctx);
}
