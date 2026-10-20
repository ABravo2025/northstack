import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from './tools.js';
import { compact, confirmable, respond } from './toolHelpers.js';

// Projects module (live 2026-10-07; added to the assistant 2026-10-20). Who sees and edits what is
// the app's rule, applied by the Private API running the Projects routes as the connected person:
// view_projects / manage_projects, or being the project's owner or on its team. The plan's open-
// project limit applies too. A project's tasks and notes use the normal task/note tools with
// entityType="project".

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;
const isoDate = z.string().describe('Calendar date, YYYY-MM-DD');
const confirmationArg = z.string().optional().describe('Only on the second call, after the user explicitly confirmed');
const STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled'] as const;
const member = z.object({
  employeeId: z.string(),
  projectRole: z.string().optional().describe('Free text, e.g. "Accountant"'),
});

export function registerProjectTools(server: McpServer, ctx: ToolContext): void {
  const { api } = ctx;

  server.registerTool('search_projects', {
    title: 'Search projects',
    description: "Projects you can see (all with view permission, otherwise the ones you own or are on), optionally by status, client company or team member. archived=true includes archived ones.",
    inputSchema: {
      status: z.enum(STATUSES).optional(),
      companyId: z.string().optional(),
      employeeId: z.string().optional().describe('Projects this employee owns or is on'),
      archived: z.boolean().optional(),
    },
    annotations: READ,
  }, async ({ archived, ...filters }) => respond(api.get('/projects', compact({ ...filters, archived: archived ? 'true' : undefined }))));

  server.registerTool('get_project', {
    title: 'Get project',
    description: 'One project with its phases (ids for projectPhaseId on tasks), team, dates and hour budget. Its tasks: search_tasks entityType="project".',
    inputSchema: { id: z.string() },
    annotations: READ,
  }, async ({ id }) => respond(api.get(`/projects/${id}`)));

  server.registerTool('create_project', {
    title: 'Create project',
    description:
      'Create a project. ownerEmployeeId and members are EMPLOYEE ids (search_employees or team_directory). Pass templateId (list_project_templates) to copy a template\'s phases and tasks; otherwise optional phases. Dates YYYY-MM-DD.',
    inputSchema: {
      name: z.string().min(1),
      ownerEmployeeId: z.string(),
      companyId: z.string().optional().describe('Client company, if any'),
      description: z.string().optional(),
      status: z.enum(STATUSES).optional().describe('Default active'),
      startDate: isoDate.optional(),
      dueDate: isoDate.optional(),
      members: z.array(member).optional(),
      phases: z.array(z.object({ name: z.string().min(1), color: z.string().optional() })).optional().describe('Ignored with templateId'),
      templateId: z.string().optional(),
    },
    annotations: WRITE,
  }, async ({ templateId, phases, ...input }) =>
    templateId
      ? respond(api.post('/projects/from-template', compact({ ...input, templateId })), 'Project created from template.')
      : respond(api.post('/projects', compact({ ...input, phases })), 'Project created.'));

  server.registerTool('update_project', {
    title: 'Update project',
    description: 'Change a project: name, description, client, owner, status, dates, hour budget. isActive=false archives it, true restores it. Pass null to clear an optional field.',
    inputSchema: {
      id: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      companyId: z.string().nullable().optional(),
      ownerEmployeeId: z.string().optional(),
      status: z.enum(STATUSES).optional(),
      startDate: isoDate.nullable().optional(),
      dueDate: isoDate.nullable().optional(),
      budgetHours: z.number().min(0).nullable().optional().describe('Hours sold/planned; the owner is told at 80% and 100%'),
      isActive: z.boolean().optional(),
    },
    annotations: WRITE,
  }, async ({ id, budgetHours, ...rest }) =>
    respond(api.patch(`/projects/${id}`, compact({ ...rest, budgetMinutes: budgetHours === undefined ? undefined : budgetHours === null ? null : Math.round(budgetHours * 60) })), 'Project updated.'));

  server.registerTool('manage_project_phase', {
    title: 'Manage project phases',
    description: 'Add a phase (action=add, name), rename/recolor one (action=update, phaseId), or reorder them all (action=reorder, phaseIds in the new order). Deleting: delete_project_phase.',
    inputSchema: {
      projectId: z.string(),
      action: z.enum(['add', 'update', 'reorder']),
      phaseId: z.string().optional(),
      name: z.string().min(1).optional(),
      color: z.string().optional(),
      phaseIds: z.array(z.string()).optional(),
    },
    annotations: WRITE,
  }, async ({ projectId, action, phaseId, name, color, phaseIds }) => {
    if (action === 'add') return respond(api.post(`/projects/${projectId}/phases`, compact({ name, color })), 'Phase added.');
    if (action === 'reorder') return respond(api.put(`/projects/${projectId}/phases/order`, { phaseIds }), 'Phases reordered.');
    if (!phaseId) return { isError: true, content: [{ type: 'text', text: 'phaseId is required to update a phase.' }] };
    return respond(api.patch(`/projects/${projectId}/phases/${phaseId}`, compact({ name, color })), 'Phase updated.');
  });

  server.registerTool('delete_project_phase', {
    title: 'Delete project phase',
    description: "Delete a project phase; its tasks are kept, without a phase. Two steps: first call returns a summary and confirmationToken; call again with it after the user confirms.",
    inputSchema: { projectId: z.string(), phaseId: z.string(), confirmationToken: confirmationArg },
    annotations: DESTRUCTIVE,
  }, async ({ projectId, phaseId, confirmationToken }) => confirmable(ctx, 'delete_project_phase', phaseId, confirmationToken,
    async () => {
      const project = await api.get<any>(`/projects/${projectId}`);
      if (!project.ok) return project;
      const phase = (project.body?.phases ?? []).find((p: any) => p.id === phaseId);
      return phase ? { ok: true, status: 200, body: { project: project.body, phase } } : { ok: false, status: 404, body: { error: 'Phase not found', code: 'not_found' } };
    },
    ({ project, phase }) => `You are about to delete the phase "${phase.name}" of the project "${project.name}" (its tasks are kept, without a phase).`,
    () => api.delete(`/projects/${projectId}/phases/${phaseId}`), 'Phase deleted.'));

  server.registerTool('manage_project_member', {
    title: 'Manage project team',
    description: "Add someone to a project's team (action=add, employeeId), change their project role (action=update, memberId), or take them off (action=remove, memberId). Member ids come from get_project.",
    inputSchema: {
      projectId: z.string(),
      action: z.enum(['add', 'update', 'remove']),
      employeeId: z.string().optional(),
      memberId: z.string().optional(),
      projectRole: z.string().nullable().optional(),
    },
    annotations: WRITE,
  }, async ({ projectId, action, employeeId, memberId, projectRole }) => {
    if (action === 'add') return respond(api.post(`/projects/${projectId}/members`, compact({ employeeId, projectRole })), 'Added to the team.');
    if (!memberId) return { isError: true, content: [{ type: 'text', text: 'memberId is required (see get_project).' }] };
    if (action === 'remove') return respond(api.delete(`/projects/${projectId}/members/${memberId}`), 'Removed from the team.');
    return respond(api.patch(`/projects/${projectId}/members/${memberId}`, { projectRole: projectRole ?? null }), 'Project role updated.');
  });

  server.registerTool('list_project_templates', {
    title: 'List project templates',
    description: 'Project templates (built-in and the company\'s own), or one template with its phases and tasks (id).',
    inputSchema: { id: z.string().optional(), locale: z.enum(['en', 'es']).optional() },
    annotations: READ,
  }, async ({ id, locale }) => respond(id ? api.get(`/project-templates/${id}`) : api.get('/project-templates', compact({ locale }))));

  server.registerTool('save_project_as_template', {
    title: 'Save project as template',
    description: "Save a project's phases and tasks as a reusable company template (Growth).",
    inputSchema: { projectId: z.string(), name: z.string().min(1), description: z.string().optional() },
    annotations: WRITE,
  }, async ({ projectId, ...input }) => respond(api.post(`/projects/${projectId}/save-as-template`, compact(input)), 'Template saved.'));
}
