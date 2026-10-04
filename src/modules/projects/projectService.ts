import prisma from '../../lib/prisma.js';
import { recordActivity } from '../activity/activityLogService.js';
import { projectActivityFieldConfig, projectPhaseActivityFieldConfig } from '../activity/fieldConfigs/projectFieldConfig.js';
import { getPlanLimits } from '../tenant/planLimits.js';
import type { PlanTier, Prisma, ProjectStatus } from '@prisma/client';

export type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Projects module (2026-10-04) — the generic engine. A project's tasks are ordinary Task rows
// (entityType = project, optional projectPhaseId), created/edited through taskService.ts like any
// other record's tasks; this file only owns the project itself, its phases and its team.
// There is deliberately no hard delete: a project is archived (isActive = false) so its tasks,
// notes and history never end up pointing at a record that no longer exists.

export const PROJECT_STATUSES: ProjectStatus[] = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
// What counts toward the Starter plan's open-project limit.
export const OPEN_PROJECT_STATUSES: ProjectStatus[] = ['planning', 'active', 'on_hold'];

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === 'string' && (PROJECT_STATUSES as string[]).includes(value);
}

// startDate/dueDate are calendar dates (@db.Date). Accepts 'YYYY-MM-DD' (or a full ISO string, of
// which only the date part is kept); '' / null clear the field; undefined leaves it untouched.
export function parseProjectDate(value: unknown): Date | null | undefined | 'invalid' {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return 'invalid';
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? 'invalid' : date;
}

const PROJECT_LIST_INCLUDE = {
  company: { select: { id: true, name: true } },
  ownerEmployee: { select: { id: true, firstName: true, lastName: true, userId: true } },
  template: { select: { id: true, name: true } },
  phases: { select: { id: true, name: true, color: true, order: true }, orderBy: { order: 'asc' } },
  _count: { select: { members: true } },
} satisfies Prisma.ProjectInclude;

const PROJECT_DETAIL_INCLUDE = {
  company: { select: { id: true, name: true } },
  ownerEmployee: { select: { id: true, firstName: true, lastName: true, userId: true } },
  template: { select: { id: true, name: true } },
  phases: { orderBy: { order: 'asc' } },
  members: {
    orderBy: { createdAt: 'asc' },
    include: {
      employee: {
        select: { id: true, firstName: true, lastName: true, userId: true, jobTitleDefn: { select: { name: true } } },
      },
    },
  },
} satisfies Prisma.ProjectInclude;

export interface ProjectProgress {
  taskCount: number;
  doneCount: number;
  overdueCount: number;
  // Earliest due date among still-open tasks — the list's "next due" column.
  nextDueDate: Date | null;
  // First phase (by order) that still has an open task; null when every phased task is done.
  currentPhaseId: string | null;
}

// Computed on read, never stored — a task completed from /tasks or Google Calendar would otherwise
// leave a stored percentage stale. One query for the whole page of projects.
async function computeProgress(
  tenantId: string,
  projects: { id: string; phases: { id: string; order: number }[] }[],
): Promise<Map<string, ProjectProgress>> {
  const result = new Map<string, ProjectProgress>();
  if (projects.length === 0) return result;
  const tasks = await prisma.task.findMany({
    where: { tenantId, entityType: 'project', entityId: { in: projects.map((p) => p.id) } },
    select: { entityId: true, completedAt: true, dueDate: true, projectPhaseId: true },
  });
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (const project of projects) {
    const own = tasks.filter((t) => t.entityId === project.id);
    const open = own.filter((t) => !t.completedAt);
    const dueDates = open.map((t) => t.dueDate).filter((d): d is Date => d !== null);
    const phasesWithOpenTasks = new Set(open.map((t) => t.projectPhaseId).filter(Boolean));
    const currentPhase = [...project.phases].sort((a, b) => a.order - b.order).find((ph) => phasesWithOpenTasks.has(ph.id));
    result.set(project.id, {
      taskCount: own.length,
      doneCount: own.length - open.length,
      overdueCount: dueDates.filter((d) => d < today).length,
      nextDueDate: dueDates.length ? new Date(Math.min(...dueDates.map((d) => d.getTime()))) : null,
      currentPhaseId: currentPhase?.id ?? null,
    });
  }
  return result;
}

export interface ListProjectsOptions {
  // undefined = every project in the tenant (the caller has view_projects); a string = only
  // projects this employee owns or is a member of; null = a caller with neither (sees nothing).
  visibleToEmployeeId?: string | null;
  includeArchived?: boolean;
  status?: ProjectStatus;
  companyId?: string;
  // "Projects this person works on" (the Employee detail section) — owner or member.
  employeeId?: string;
}

function involvesEmployee(employeeId: string): Prisma.ProjectWhereInput {
  return { OR: [{ ownerEmployeeId: employeeId }, { members: { some: { employeeId } } }] };
}

export async function listProjects(tenantId: string, options: ListProjectsOptions = {}) {
  if (options.visibleToEmployeeId === null) return [];
  const and: Prisma.ProjectWhereInput[] = [];
  if (options.visibleToEmployeeId) and.push(involvesEmployee(options.visibleToEmployeeId));
  if (options.employeeId) and.push(involvesEmployee(options.employeeId));

  const projects = await prisma.project.findMany({
    where: {
      tenantId,
      ...(options.includeArchived ? {} : { isActive: true }),
      ...(options.status ? { status: options.status } : {}),
      ...(options.companyId ? { companyId: options.companyId } : {}),
      ...(and.length ? { AND: and } : {}),
    },
    include: PROJECT_LIST_INCLUDE,
    orderBy: [{ createdAt: 'desc' }],
  });
  const progress = await computeProgress(tenantId, projects);
  return projects.map((p) => ({ ...p, progress: progress.get(p.id)! }));
}

export async function findProjectById(id: string) {
  return prisma.project.findUnique({ where: { id } });
}

export async function getProjectDetail(id: string) {
  const project = await prisma.project.findUnique({ where: { id }, include: PROJECT_DETAIL_INCLUDE });
  if (!project) return null;
  const progress = await computeProgress(project.tenantId, [project]);
  return { ...project, progress: progress.get(project.id)! };
}

// ---- Plan limit ----------------------------------------------------------------------------

export async function countOpenProjects(tenantId: string, excludeProjectId?: string): Promise<number> {
  return prisma.project.count({
    where: {
      tenantId,
      isActive: true,
      status: { in: OPEN_PROJECT_STATUSES },
      ...(excludeProjectId ? { id: { not: excludeProjectId } } : {}),
    },
  });
}

type TenantPlan = { plan: PlanTier | null; planOverride?: Prisma.JsonValue | null } | null;

// Whether one more project may be open (new, reopened or unarchived). excludeProjectId keeps a
// project that's already open from counting against itself when it's edited.
export async function hasRoomForOpenProject(tenant: TenantPlan, tenantId: string, excludeProjectId?: string) {
  const max = getPlanLimits(tenant).maxActiveProjects;
  if (max === null) return { allowed: true, max };
  return { allowed: (await countOpenProjects(tenantId, excludeProjectId)) < max, max };
}

export function wouldBeOpen(status: ProjectStatus, isActive: boolean): boolean {
  return isActive && OPEN_PROJECT_STATUSES.includes(status);
}

// ---- Activity helpers ----------------------------------------------------------------------

async function teamLabel(projectId: string): Promise<string> {
  const members = await prisma.projectMember.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    select: { employee: { select: { firstName: true, lastName: true } } },
  });
  return members.map((m) => `${m.employee.firstName} ${m.employee.lastName}`).join(', ');
}

// ---- Create / update -----------------------------------------------------------------------

export interface ProjectMemberInput {
  employeeId: string;
  projectRole?: string | null;
}

export interface CreateProjectInput {
  tenantId: string;
  name: string;
  description?: string | null;
  companyId?: string | null;
  ownerEmployeeId: string;
  status?: ProjectStatus;
  startDate?: Date | null;
  dueDate?: Date | null;
  templateId?: string | null;
  members?: ProjectMemberInput[];
  phases?: { name: string; color?: string | null }[];
}

export const PHASE_COLORS = ['#7c5cff', '#2f80ed', '#0fa37f', '#e0912f', '#d6457a', '#5a6378'];

function cleanRole(role: string | null | undefined): string | null {
  const trimmed = role?.trim();
  return trimmed ? trimmed.slice(0, 80) : null;
}

// The owner is always on the team (a member row, so they can also hold a template role such as
// "Contador"); duplicates in the input collapse to the first occurrence.
function normalizeMembers(ownerEmployeeId: string, members: ProjectMemberInput[] = []): ProjectMemberInput[] {
  const seen = new Set<string>();
  const out: ProjectMemberInput[] = [];
  for (const m of members) {
    if (seen.has(m.employeeId)) continue;
    seen.add(m.employeeId);
    out.push({ employeeId: m.employeeId, projectRole: cleanRole(m.projectRole) });
  }
  if (!seen.has(ownerEmployeeId)) out.unshift({ employeeId: ownerEmployeeId, projectRole: null });
  return out;
}

// Runs inside an optional outer transaction so templateService.ts can create the project and all
// of its template tasks atomically. Activity is recorded by the caller via recordProjectCreated,
// after the transaction commits (recordActivity is best-effort and must not run inside it).
export async function createProjectRecords(tx: PrismaTx, input: CreateProjectInput, createdById: string) {
  const status = input.status ?? 'active';
  const project = await tx.project.create({
    data: {
      tenantId: input.tenantId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      companyId: input.companyId ?? null,
      ownerEmployeeId: input.ownerEmployeeId,
      status,
      completedAt: status === 'completed' ? new Date() : null,
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      templateId: input.templateId ?? null,
      createdById,
    },
  });
  const phases = [];
  for (const [index, phase] of (input.phases ?? []).entries()) {
    phases.push(
      await tx.projectPhase.create({
        data: {
          tenantId: input.tenantId,
          projectId: project.id,
          name: phase.name.trim(),
          color: phase.color ?? PHASE_COLORS[index % PHASE_COLORS.length],
          order: index,
        },
      }),
    );
  }
  const members = normalizeMembers(input.ownerEmployeeId, input.members);
  await tx.projectMember.createMany({
    data: members.map((m) => ({ tenantId: input.tenantId, projectId: project.id, employeeId: m.employeeId, projectRole: m.projectRole ?? null })),
  });
  return { project, phases, members };
}

export async function recordProjectCreated(project: { id: string; tenantId: string; name: string }, changedByUserId: string) {
  const after = await prisma.project.findUnique({ where: { id: project.id } });
  await recordActivity({
    tenantId: project.tenantId,
    entityType: 'project',
    entityId: project.id,
    entityLabel: project.name,
    action: 'create',
    changedByUserId,
    after: after ? { ...after, team: await teamLabel(project.id) } : null,
    fieldConfig: projectActivityFieldConfig,
  });
}

export async function createProject(input: CreateProjectInput, createdById: string) {
  const { project } = await prisma.$transaction((tx) => createProjectRecords(tx, input, createdById));
  await recordProjectCreated(project, createdById);
  return getProjectDetail(project.id);
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  companyId?: string | null;
  ownerEmployeeId?: string;
  status?: ProjectStatus;
  startDate?: Date | null;
  dueDate?: Date | null;
  isActive?: boolean;
}

export async function updateProject(id: string, input: UpdateProjectInput, changedByUserId: string) {
  const before = await prisma.project.findUniqueOrThrow({ where: { id } });
  const teamBefore = await teamLabel(id);

  const data: Prisma.ProjectUncheckedUpdateInput = { updatedById: changedByUserId };
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.companyId !== undefined) data.companyId = input.companyId;
  if (input.ownerEmployeeId !== undefined) data.ownerEmployeeId = input.ownerEmployeeId;
  if (input.startDate !== undefined) data.startDate = input.startDate;
  if (input.dueDate !== undefined) data.dueDate = input.dueDate;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.status !== undefined && input.status !== before.status) {
    data.status = input.status;
    data.completedAt = input.status === 'completed' ? new Date() : null;
  }

  await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id }, data });
    // A new owner joins the team if they weren't on it (see normalizeMembers).
    if (input.ownerEmployeeId !== undefined && input.ownerEmployeeId !== before.ownerEmployeeId) {
      await tx.projectMember.upsert({
        where: { projectId_employeeId: { projectId: id, employeeId: input.ownerEmployeeId } },
        create: { tenantId: before.tenantId, projectId: id, employeeId: input.ownerEmployeeId },
        update: {},
      });
    }
  });

  const after = await prisma.project.findUniqueOrThrow({ where: { id } });
  await recordActivity({
    tenantId: before.tenantId,
    entityType: 'project',
    entityId: id,
    entityLabel: after.name,
    action: 'update',
    changedByUserId,
    before: { ...before, team: teamBefore },
    after: { ...after, team: await teamLabel(id) },
    fieldConfig: projectActivityFieldConfig,
  });
  return getProjectDetail(id);
}

// ---- Phases --------------------------------------------------------------------------------

export async function findPhaseById(id: string) {
  return prisma.projectPhase.findUnique({ where: { id } });
}

async function recordPhaseActivity(
  phase: { id: string; tenantId: string; projectId: string; name: string },
  action: 'create' | 'update' | 'delete',
  changedByUserId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  await recordActivity({
    tenantId: phase.tenantId,
    entityType: 'projectPhase',
    entityId: phase.id,
    entityLabel: phase.name,
    action,
    changedByUserId,
    before,
    after,
    fieldConfig: projectPhaseActivityFieldConfig,
    parentEntityType: 'project',
    parentEntityId: phase.projectId,
  });
}

export async function createPhase(
  project: { id: string; tenantId: string },
  input: { name: string; color?: string | null },
  changedByUserId: string,
) {
  const last = await prisma.projectPhase.findFirst({ where: { projectId: project.id }, orderBy: { order: 'desc' }, select: { order: true } });
  const order = last ? last.order + 1 : 0;
  const phase = await prisma.projectPhase.create({
    data: {
      tenantId: project.tenantId,
      projectId: project.id,
      name: input.name.trim(),
      color: input.color ?? PHASE_COLORS[order % PHASE_COLORS.length],
      order,
    },
  });
  await recordPhaseActivity(phase, 'create', changedByUserId, null, phase);
  return phase;
}

export async function updatePhase(id: string, input: { name?: string; color?: string | null }, changedByUserId: string) {
  const before = await prisma.projectPhase.findUniqueOrThrow({ where: { id } });
  const data: Prisma.ProjectPhaseUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.color !== undefined) data.color = input.color;
  const phase = await prisma.projectPhase.update({ where: { id }, data });
  await recordPhaseActivity(phase, 'update', changedByUserId, before, phase);
  return phase;
}

// The phase's tasks stay on the project with no phase (Task.projectPhaseId is onDelete: SetNull).
export async function deletePhase(id: string, changedByUserId: string) {
  const before = await prisma.projectPhase.findUniqueOrThrow({ where: { id } });
  await prisma.projectPhase.delete({ where: { id } });
  await recordPhaseActivity(before, 'delete', changedByUserId, before, null);
}

// orderedIds must be exactly this project's phase ids (the route checks). Not logged per phase —
// a drag-and-drop would otherwise write one Activity entry for every phase that shifted.
export async function reorderPhases(projectId: string, orderedIds: string[]) {
  await prisma.$transaction(orderedIds.map((id, index) => prisma.projectPhase.update({ where: { id }, data: { order: index } })));
  return prisma.projectPhase.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
}

export async function listPhaseIds(projectId: string): Promise<string[]> {
  const phases = await prisma.projectPhase.findMany({ where: { projectId }, select: { id: true } });
  return phases.map((p) => p.id);
}

// ---- Team ----------------------------------------------------------------------------------

export async function findMemberById(id: string) {
  return prisma.projectMember.findUnique({ where: { id } });
}

async function recordTeamChange(project: { id: string; tenantId: string; name: string }, teamBefore: string, changedByUserId: string) {
  await recordActivity({
    tenantId: project.tenantId,
    entityType: 'project',
    entityId: project.id,
    entityLabel: project.name,
    action: 'update',
    changedByUserId,
    before: { team: teamBefore },
    after: { team: await teamLabel(project.id) },
    fieldConfig: { team: projectActivityFieldConfig.team },
  });
}

export async function addMember(
  project: { id: string; tenantId: string; name: string },
  input: ProjectMemberInput,
  changedByUserId: string,
) {
  const teamBefore = await teamLabel(project.id);
  const member = await prisma.projectMember.create({
    data: { tenantId: project.tenantId, projectId: project.id, employeeId: input.employeeId, projectRole: cleanRole(input.projectRole) },
  });
  await recordTeamChange(project, teamBefore, changedByUserId);
  return member;
}

export async function isMember(projectId: string, employeeId: string): Promise<boolean> {
  return (await prisma.projectMember.count({ where: { projectId, employeeId } })) > 0;
}

// A role change isn't a team change — nothing to log on the project's feed.
export async function updateMemberRole(id: string, projectRole: string | null) {
  return prisma.projectMember.update({ where: { id }, data: { projectRole: cleanRole(projectRole) } });
}

export async function removeMember(project: { id: string; tenantId: string; name: string }, memberId: string, changedByUserId: string) {
  const teamBefore = await teamLabel(project.id);
  await prisma.projectMember.delete({ where: { id: memberId } });
  await recordTeamChange(project, teamBefore, changedByUserId);
}

// ---- Cross-module guards -------------------------------------------------------------------

// Deleting an Employee who owns projects would hit Project.ownerEmployee's Restrict FK as an
// unhandled 500 — the employee routes ask this first and answer with a clear 409 instead.
export async function countProjectsOwnedBy(employeeId: string): Promise<number> {
  return prisma.project.count({ where: { ownerEmployeeId: employeeId } });
}
