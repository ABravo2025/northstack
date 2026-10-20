import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from './tools.js';
import { apiError, compact, data, respond } from './toolHelpers.js';

// Workspace tools (2026-10-20): the people and catalog lists every other tool's ids come from
// (users for assignees, departments/job titles/statuses for employees, custom-field definitions,
// tags, roles for invitations), plus the company profile, the Activity Log and the connected
// person's own notifications. All read-only except marking notifications read.

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

const CATALOG_KINDS = [
  'departments',
  'job_titles',
  'employee_statuses',
  'lead_sources',
  'win_reasons',
  'loss_reasons',
  'company_sizes',
  'custom_fields',
  'tags',
  'assignable_roles',
] as const;

const FIELD_CATALOG: Partial<Record<(typeof CATALOG_KINDS)[number], string>> = {
  departments: 'department',
  job_titles: 'jobTitle',
  lead_sources: 'leadSource',
  win_reasons: 'winReason',
  loss_reasons: 'lossReason',
  company_sizes: 'companySize',
};

export function registerWorkspaceTools(server: McpServer, ctx: ToolContext): void {
  const { api } = ctx;

  server.registerTool('list_users', {
    title: 'List users',
    description: "Active people with a Northstack login (user ids). Use these ids for a task's assigneeId and for @mentions. For employee records use search_employees.",
    annotations: READ,
  }, async () => respond(api.get('/tasks/mentionable-users')));

  server.registerTool('list_catalogs', {
    title: 'List catalogs',
    description:
      'The ids behind pick-lists: departments, job_titles, employee_statuses (for create/update_employee), lead_sources / win_reasons / loss_reasons / company_sizes (CRM), custom_fields (definitions; pass entityType), tags, assignable_roles (for invite_employee). Read-only: catalogs are edited in Settings.',
    inputSchema: {
      kind: z.enum(CATALOG_KINDS),
      entityType: z.enum(['employee', 'company', 'contact', 'opportunity', 'project']).optional().describe('custom_fields only; default employee'),
    },
    annotations: READ,
  }, async ({ kind, entityType }) => {
    const fieldCatalogKind = FIELD_CATALOG[kind];
    if (fieldCatalogKind) return respond(api.get('/field-catalog', { kind: fieldCatalogKind }));
    if (kind === 'employee_statuses') return respond(api.get('/status-definitions', { entityType: 'employee' }));
    if (kind === 'custom_fields') return respond(api.get('/hr/custom-fields', { entityType: entityType ?? 'employee' }));
    if (kind === 'tags') return respond(api.get('/tags'));
    return respond(api.get('/roles/assignable'));
  });

  server.registerTool('company_profile', {
    title: 'Company profile',
    description: "This workspace's company details: name, legal name, country, currency, address, plan and trial dates.",
    annotations: READ,
  }, async () => respond(api.get('/tenants/current')));

  server.registerTool('team_directory', {
    title: 'Team directory',
    description: 'Everyone in the company with name, job title and department (what any member sees), or view="birthdays" for upcoming birthdays.',
    inputSchema: { view: z.enum(['directory', 'birthdays']).optional() },
    annotations: READ,
  }, async ({ view }) => respond(api.get(view === 'birthdays' ? '/hr/employees/birthdays' : '/hr/employees/directory')));

  server.registerTool('activity_log', {
    title: 'Activity log',
    description:
      'Who changed what and when. With entityType + entityId: the history of one record. Without: the workspace feed (needs the Activity Log permission), filterable by user, action, source ("ai" for assistant actions) and dates.',
    inputSchema: {
      entityType: z.enum(['employee', 'company', 'contact', 'opportunity', 'project']).optional(),
      entityId: z.string().optional(),
      userId: z.string().optional().describe('Feed only: changes made by this user'),
      action: z.enum(['create', 'update', 'delete']).optional(),
      source: z.enum(['ui', 'api', 'ai']).optional(),
      from: z.string().optional().describe('Feed only: YYYY-MM-DD'),
      to: z.string().optional().describe('Feed only: YYYY-MM-DD'),
      cursor: z.string().optional().describe('Feed only: nextCursor from a previous page'),
    },
    annotations: READ,
  }, async ({ entityType, entityId, ...feed }) => {
    if (entityType && entityId) return respond(api.get('/activity', { entityType, entityId }));
    return respond(api.get('/activity/feed', compact({ ...feed, entityType })));
  });

  server.registerTool('my_notifications', {
    title: 'My notifications',
    description: "The connected person's in-app notifications (mentions, approvals, assignments…), newest first, with the unread count.",
    inputSchema: { page: z.number().int().min(1).optional() },
    annotations: READ,
  }, async ({ page }) => {
    const [list, unread] = await Promise.all([api.get('/notifications', { page }), api.get('/notifications/unread-count')]);
    if (!list.ok) return apiError(list);
    return data({ unread: unread.ok ? unread.body : null, notifications: list.body });
  });

  server.registerTool('mark_notifications_read', {
    title: 'Mark notifications read',
    description: 'Mark one notification (id) or all of them (all=true) as read.',
    inputSchema: { id: z.string().optional(), all: z.boolean().optional() },
    annotations: WRITE,
  }, async ({ id, all }) => {
    if (all) return respond(api.post('/notifications/mark-all-read', {}), 'All notifications marked as read.');
    if (!id) return { isError: true, content: [{ type: 'text', text: 'Pass a notification id, or all=true.' }] };
    return respond(api.patch(`/notifications/${id}/read`, {}), 'Notification marked as read.');
  });
}
