import type { Request, Response } from 'express';
import type { ProjectStatus } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import type { AuthenticatedUser } from '../modules/auth/authService.js';
import { canManageProjects, canViewProjects } from '../modules/auth/permissionService.js';
import { canEditProject, canViewProject, findOwnEmployeeId } from '../modules/projects/projectAccess.js';
import { getPlanLimits } from '../modules/tenant/planLimits.js';
import {
  deleteTenantTemplate,
  findTemplateForTenant,
  getTemplateDetail,
  instantiateTemplate,
  listTemplates,
  resolveTemplateLocale,
  saveProjectAsTemplate,
} from '../modules/projects/projectTemplateService.js';
import {
  addMember,
  countOpenProjects,
  createPhase,
  createProject,
  deletePhase,
  findMemberById,
  findPhaseById,
  findProjectById,
  getProjectDetail,
  hasRoomForOpenProject,
  isMember,
  isProjectStatus,
  listPhaseIds,
  listProjects,
  parseProjectDate,
  removeMember,
  reorderPhases,
  updateMemberRole,
  updatePhase,
  updateProject,
  wouldBeOpen,
  type ProjectMemberInput,
} from '../modules/projects/projectService.js';

// Projects module (2026-10-04). Access: view_projects / manage_projects cover every project; a
// project's owner and members always see it, and its owner can edit it (projectAccess.ts). The
// project's tasks/notes/tags go through the ordinary cross-module routes (entityType = project).

export const projectsRouter = createAsyncRouter();

const MAX_NAME = 200;

function planLimitError(max: number) {
  return {
    error: `Your plan allows up to ${max} open projects. Complete or archive one, or upgrade to Growth for unlimited projects.`,
    code: 'plan_limit_projects',
    limit: max,
  };
}

// 404 (not 403) for a project the caller can't see, so ids of other people's projects don't leak.
async function loadProject(req: Request, res: Response, user: AuthenticatedUser, mode: 'view' | 'edit') {
  const project = await findProjectById(String(req.params.projectId));
  if (!project || project.tenantId !== user.tenantId || !(await canViewProject(user, project.id))) {
    res.status(404).json({ error: 'Project not found' });
    return null;
  }
  if (mode === 'edit' && !(await canEditProject(user, project.id))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return null;
  }
  return project;
}

async function employeesBelongToTenant(tenantId: string, ids: string[]): Promise<boolean> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return true;
  const count = await prisma.employee.count({ where: { tenantId, id: { in: unique } } });
  return count === unique.length;
}

async function companyBelongsToTenant(tenantId: string, companyId: string): Promise<boolean> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { tenantId: true } });
  return company?.tenantId === tenantId;
}

function parseMembers(raw: unknown): ProjectMemberInput[] | 'invalid' {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return 'invalid';
  const out: ProjectMemberInput[] = [];
  for (const m of raw) {
    if (!m || typeof m.employeeId !== 'string') return 'invalid';
    if (m.projectRole !== undefined && m.projectRole !== null && typeof m.projectRole !== 'string') return 'invalid';
    out.push({ employeeId: m.employeeId, projectRole: m.projectRole ?? null });
  }
  return out;
}

function parseName(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return raw.trim().slice(0, MAX_NAME);
}

// ---- Projects ------------------------------------------------------------------------------

projectsRouter.get('/api/projects', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;

  const status = req.query.status;
  if (status !== undefined && !isProjectStatus(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const visibleToEmployeeId = canViewProjects(user.roleContext) ? undefined : await findOwnEmployeeId(user);
  const projects = await listProjects(user.tenantId!, {
    visibleToEmployeeId,
    status: status as ProjectStatus | undefined,
    includeArchived: req.query.archived === 'true',
    companyId: typeof req.query.companyId === 'string' ? req.query.companyId : undefined,
    employeeId: typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined,
  });

  const limits = getPlanLimits(user.tenant);
  return res.json({
    projects,
    limits: {
      maxActiveProjects: limits.maxActiveProjects,
      openCount: await countOpenProjects(user.tenantId!),
      customTemplatesEnabled: limits.customProjectTemplatesEnabled,
    },
  });
});

// The pickers' data (owner, team, company) for people who create or edit projects. Deliberately
// minimal — ids, names, job title and whether they have a login — so picking a teammate or a client
// never needs view_employee/view_company, and never exposes anything beyond a name.
projectsRouter.get('/api/projects/options', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;
  const allowed = canManageProjects(user.roleContext) || (projectId !== null && (await canEditProject(user, projectId)));
  if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });

  const [employees, companies] = await Promise.all([
    prisma.employee.findMany({
      where: { tenantId: user.tenantId! },
      select: { id: true, firstName: true, lastName: true, userId: true, jobTitleDefn: { select: { name: true } } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
    prisma.company.findMany({
      where: { tenantId: user.tenantId!, isPlaceholder: false },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  return res.json({
    employees: employees.map((e) => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      jobTitle: e.jobTitleDefn?.name ?? null,
      hasLogin: e.userId !== null,
      userId: e.userId,
    })),
    companies,
    ownEmployeeId: await findOwnEmployeeId(user),
  });
});

projectsRouter.post('/api/projects', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageProjects(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const name = parseName(req.body.name);
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const status = req.body.status ?? 'active';
  if (!isProjectStatus(status)) return res.status(400).json({ error: 'Invalid status' });

  const startDate = parseProjectDate(req.body.startDate);
  const dueDate = parseProjectDate(req.body.dueDate);
  if (startDate === 'invalid' || dueDate === 'invalid') return res.status(400).json({ error: 'Dates must be YYYY-MM-DD' });

  const ownerEmployeeId = req.body.ownerEmployeeId;
  if (typeof ownerEmployeeId !== 'string') return res.status(400).json({ error: 'ownerEmployeeId is required' });

  const members = parseMembers(req.body.members);
  if (members === 'invalid') return res.status(400).json({ error: 'Invalid members' });
  if (!(await employeesBelongToTenant(user.tenantId!, [ownerEmployeeId, ...members.map((m) => m.employeeId)]))) {
    return res.status(400).json({ error: 'Employee not found' });
  }

  const companyId = req.body.companyId || null;
  if (companyId && !(await companyBelongsToTenant(user.tenantId!, companyId))) {
    return res.status(400).json({ error: 'Company not found' });
  }

  let phases: { name: string; color?: string | null }[] = [];
  if (req.body.phases !== undefined) {
    if (!Array.isArray(req.body.phases) || req.body.phases.some((p: { name?: unknown }) => !parseName(p?.name))) {
      return res.status(400).json({ error: 'Invalid phases' });
    }
    phases = req.body.phases.map((p: { name: string; color?: unknown }) => ({
      name: parseName(p.name)!,
      color: typeof p.color === 'string' ? p.color : null,
    }));
  }

  if (wouldBeOpen(status, true)) {
    const room = await hasRoomForOpenProject(user.tenant, user.tenantId!);
    if (!room.allowed) return res.status(403).json(planLimitError(room.max!));
  }

  const project = await createProject(
    {
      tenantId: user.tenantId!,
      name,
      description: typeof req.body.description === 'string' ? req.body.description : null,
      companyId,
      ownerEmployeeId,
      status,
      startDate: startDate ?? null,
      dueDate: dueDate ?? null,
      members,
      phases,
    },
    user.id,
  );
  return res.status(201).json(project);
});

projectsRouter.get('/api/projects/:projectId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const project = await loadProject(req, res, user, 'view');
  if (!project) return;

  const detail = await getProjectDetail(project.id);
  return res.json({ ...detail, canEdit: await canEditProject(user, project.id) });
});

projectsRouter.patch('/api/projects/:projectId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const project = await loadProject(req, res, user, 'edit');
  if (!project) return;

  const input: Parameters<typeof updateProject>[1] = {};

  if (req.body.name !== undefined) {
    const name = parseName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Name is required' });
    input.name = name;
  }
  if (req.body.description !== undefined) {
    if (req.body.description !== null && typeof req.body.description !== 'string') return res.status(400).json({ error: 'Invalid description' });
    input.description = req.body.description;
  }
  if (req.body.status !== undefined) {
    if (!isProjectStatus(req.body.status)) return res.status(400).json({ error: 'Invalid status' });
    input.status = req.body.status;
  }
  if (req.body.isActive !== undefined) {
    if (typeof req.body.isActive !== 'boolean') return res.status(400).json({ error: 'isActive must be a boolean' });
    input.isActive = req.body.isActive;
  }
  for (const key of ['startDate', 'dueDate'] as const) {
    const parsed = parseProjectDate(req.body[key]);
    if (parsed === 'invalid') return res.status(400).json({ error: 'Dates must be YYYY-MM-DD' });
    if (parsed !== undefined) input[key] = parsed;
  }
  if (req.body.companyId !== undefined) {
    const companyId = req.body.companyId || null;
    if (companyId && !(await companyBelongsToTenant(user.tenantId!, companyId))) {
      return res.status(400).json({ error: 'Company not found' });
    }
    input.companyId = companyId;
  }
  if (req.body.ownerEmployeeId !== undefined) {
    if (typeof req.body.ownerEmployeeId !== 'string' || !(await employeesBelongToTenant(user.tenantId!, [req.body.ownerEmployeeId]))) {
      return res.status(400).json({ error: 'Employee not found' });
    }
    input.ownerEmployeeId = req.body.ownerEmployeeId;
  }

  // Reopening, un-archiving or un-cancelling counts against the plan like creating would.
  const wasOpen = wouldBeOpen(project.status, project.isActive);
  const willBeOpen = wouldBeOpen(input.status ?? project.status, input.isActive ?? project.isActive);
  if (!wasOpen && willBeOpen) {
    const room = await hasRoomForOpenProject(user.tenant, user.tenantId!, project.id);
    if (!room.allowed) return res.status(403).json(planLimitError(room.max!));
  }

  const updated = await updateProject(project.id, input, user.id);
  return res.json({ ...updated, canEdit: await canEditProject(user, project.id) });
});

// ---- Phases --------------------------------------------------------------------------------

projectsRouter.post('/api/projects/:projectId/phases', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const project = await loadProject(req, res, user, 'edit');
  if (!project) return;

  const name = parseName(req.body.name);
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const phase = await createPhase(project, { name, color: typeof req.body.color === 'string' ? req.body.color : null }, user.id);
  return res.status(201).json(phase);
});

// Declared before the :phaseId routes so "order" is never read as a phase id.
projectsRouter.put('/api/projects/:projectId/phases/order', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const project = await loadProject(req, res, user, 'edit');
  if (!project) return;

  const ids = req.body.phaseIds;
  const current = await listPhaseIds(project.id);
  if (
    !Array.isArray(ids) ||
    ids.length !== current.length ||
    new Set(ids).size !== ids.length ||
    !ids.every((id: unknown) => typeof id === 'string' && current.includes(id))
  ) {
    return res.status(400).json({ error: "phaseIds must list every one of this project's phases exactly once" });
  }
  return res.json(await reorderPhases(project.id, ids));
});

projectsRouter.patch('/api/projects/:projectId/phases/:phaseId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const project = await loadProject(req, res, user, 'edit');
  if (!project) return;

  const phase = await findPhaseById(req.params.phaseId);
  if (!phase || phase.projectId !== project.id) return res.status(404).json({ error: 'Phase not found' });

  const input: { name?: string; color?: string | null } = {};
  if (req.body.name !== undefined) {
    const name = parseName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Name is required' });
    input.name = name;
  }
  if (req.body.color !== undefined) {
    if (req.body.color !== null && typeof req.body.color !== 'string') return res.status(400).json({ error: 'Invalid color' });
    input.color = req.body.color;
  }
  return res.json(await updatePhase(phase.id, input, user.id));
});

projectsRouter.delete('/api/projects/:projectId/phases/:phaseId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const project = await loadProject(req, res, user, 'edit');
  if (!project) return;

  const phase = await findPhaseById(req.params.phaseId);
  if (!phase || phase.projectId !== project.id) return res.status(404).json({ error: 'Phase not found' });
  await deletePhase(phase.id, user.id);
  return res.status(204).end();
});

// ---- Team ----------------------------------------------------------------------------------

projectsRouter.post('/api/projects/:projectId/members', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const project = await loadProject(req, res, user, 'edit');
  if (!project) return;

  const employeeId = req.body.employeeId;
  if (typeof employeeId !== 'string' || !(await employeesBelongToTenant(user.tenantId!, [employeeId]))) {
    return res.status(400).json({ error: 'Employee not found' });
  }
  if (req.body.projectRole !== undefined && req.body.projectRole !== null && typeof req.body.projectRole !== 'string') {
    return res.status(400).json({ error: 'Invalid projectRole' });
  }
  if (await isMember(project.id, employeeId)) {
    return res.status(409).json({ error: 'This person is already on the team' });
  }
  const member = await addMember(project, { employeeId, projectRole: req.body.projectRole ?? null }, user.id);
  return res.status(201).json(member);
});

projectsRouter.patch('/api/projects/:projectId/members/:memberId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const project = await loadProject(req, res, user, 'edit');
  if (!project) return;

  const member = await findMemberById(req.params.memberId);
  if (!member || member.projectId !== project.id) return res.status(404).json({ error: 'Member not found' });
  if (req.body.projectRole !== null && typeof req.body.projectRole !== 'string') {
    return res.status(400).json({ error: 'Invalid projectRole' });
  }
  return res.json(await updateMemberRole(member.id, req.body.projectRole));
});

projectsRouter.delete('/api/projects/:projectId/members/:memberId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const project = await loadProject(req, res, user, 'edit');
  if (!project) return;

  const member = await findMemberById(req.params.memberId);
  if (!member || member.projectId !== project.id) return res.status(404).json({ error: 'Member not found' });
  if (member.employeeId === project.ownerEmployeeId) {
    return res.status(400).json({ error: "The project's owner is always on the team. Change the owner first.", code: 'owner_is_member' });
  }
  await removeMember(project, member.id, user.id);
  return res.status(204).end();
});

// ---- Templates -----------------------------------------------------------------------------
// Only people who can create projects need the gallery. System templates come in the requested
// language (?locale=en|es, the UI's current language); the tenant's own templates in any.

projectsRouter.get('/api/project-templates', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageProjects(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });

  const templates = await listTemplates(user.tenantId!, resolveTemplateLocale(req.query.locale));
  return res.json({ templates, customTemplatesEnabled: getPlanLimits(user.tenant).customProjectTemplatesEnabled });
});

projectsRouter.get('/api/project-templates/:templateId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageProjects(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });

  const template = await getTemplateDetail(String(req.params.templateId), user.tenantId!);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  return res.json(template);
});

projectsRouter.delete('/api/project-templates/:templateId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageProjects(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });

  const template = await findTemplateForTenant(String(req.params.templateId), user.tenantId!);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  if (template.tenantId === null) return res.status(400).json({ error: 'System templates cannot be deleted' });
  await deleteTenantTemplate(template.id, user.tenantId!, user.id);
  return res.status(204).end();
});

projectsRouter.post('/api/projects/from-template', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageProjects(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });

  if (typeof req.body.templateId !== 'string' || !(await findTemplateForTenant(req.body.templateId, user.tenantId!))) {
    return res.status(404).json({ error: 'Template not found' });
  }
  const name = parseName(req.body.name);
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const status = req.body.status ?? 'active';
  if (!isProjectStatus(status)) return res.status(400).json({ error: 'Invalid status' });

  const startDate = parseProjectDate(req.body.startDate);
  const dueDate = parseProjectDate(req.body.dueDate);
  if (startDate === 'invalid' || dueDate === 'invalid') return res.status(400).json({ error: 'Dates must be YYYY-MM-DD' });

  const ownerEmployeeId = req.body.ownerEmployeeId;
  if (typeof ownerEmployeeId !== 'string') return res.status(400).json({ error: 'ownerEmployeeId is required' });
  const members = parseMembers(req.body.members);
  if (members === 'invalid') return res.status(400).json({ error: 'Invalid members' });
  if (!(await employeesBelongToTenant(user.tenantId!, [ownerEmployeeId, ...members.map((m) => m.employeeId)]))) {
    return res.status(400).json({ error: 'Employee not found' });
  }

  const companyId = req.body.companyId || null;
  if (companyId && !(await companyBelongsToTenant(user.tenantId!, companyId))) {
    return res.status(400).json({ error: 'Company not found' });
  }

  if (wouldBeOpen(status, true)) {
    const room = await hasRoomForOpenProject(user.tenant, user.tenantId!);
    if (!room.allowed) return res.status(403).json(planLimitError(room.max!));
  }

  const project = await instantiateTemplate(
    {
      templateId: req.body.templateId,
      tenantId: user.tenantId!,
      name,
      description: typeof req.body.description === 'string' ? req.body.description : null,
      companyId,
      ownerEmployeeId,
      status,
      startDate: startDate ?? null,
      dueDate: dueDate ?? null,
      members,
    },
    user.id,
  );
  return res.status(201).json(project);
});

projectsRouter.post('/api/projects/:projectId/save-as-template', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageProjects(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const project = await loadProject(req, res, user, 'view');
  if (!project) return;

  if (!getPlanLimits(user.tenant).customProjectTemplatesEnabled) {
    return res.status(403).json({
      error: 'Saving your own templates is part of the Growth plan.',
      code: 'plan_feature_project_templates',
    });
  }
  const name = parseName(req.body.name);
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const template = await saveProjectAsTemplate(
    project.id,
    {
      name,
      description: typeof req.body.description === 'string' ? req.body.description : null,
      noPhaseName: resolveTemplateLocale(req.body.locale) === 'es' ? 'Otras tareas' : 'Other tasks',
    },
    user.id,
  );
  return res.status(201).json(template);
});
