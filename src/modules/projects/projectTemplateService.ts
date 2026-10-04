import prisma from '../../lib/prisma.js';
import { recordActivity } from '../activity/activityLogService.js';
import { syncTaskCalendarEvent } from '../integrations/googleCalendarSyncService.js';
import { SYSTEM_TEMPLATES, SYSTEM_TEMPLATE_LOCALES } from './systemTemplates.js';
import {
  PHASE_COLORS,
  createProjectRecords,
  getProjectDetail,
  recordProjectCreated,
  type CreateProjectInput,
} from './projectService.js';
import type { Prisma } from '@prisma/client';

// Projects module (2026-10-04) — templates. A template is a saved shape (phases + tasks with a
// relative due date and a suggested role); creating a project from one copies that shape once and
// never reads the template again. System templates (tenantId null) are seeded per locale from
// systemTemplates.ts; tenant templates come from "Save as template" (Growth).

export type TemplateLocale = 'en' | 'es';

export function resolveTemplateLocale(value: unknown): TemplateLocale {
  return value === 'es' ? 'es' : 'en';
}

const TEMPLATE_DETAIL_INCLUDE = {
  phases: {
    orderBy: { order: 'asc' },
    include: { tasks: { orderBy: { order: 'asc' } } },
  },
} satisfies Prisma.ProjectTemplateInclude;

type TemplateWithPhases = Prisma.ProjectTemplateGetPayload<{ include: typeof TEMPLATE_DETAIL_INCLUDE }>;

function rolesOf(template: TemplateWithPhases): string[] {
  const roles: string[] = [];
  for (const phase of template.phases) {
    for (const task of phase.tasks) {
      if (task.projectRole && !roles.includes(task.projectRole)) roles.push(task.projectRole);
    }
  }
  return roles;
}

function summarize(template: TemplateWithPhases) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    niche: template.niche,
    isSystem: template.tenantId === null,
    roles: rolesOf(template),
    taskCount: template.phases.reduce((sum, p) => sum + p.tasks.length, 0),
    phases: template.phases.map((p) => ({ id: p.id, name: p.name, color: p.color, taskCount: p.tasks.length })),
  };
}

// System templates in the viewer's language, then the tenant's own (any language — they were
// written by the tenant, never translated).
export async function listTemplates(tenantId: string, locale: TemplateLocale) {
  const templates = await prisma.projectTemplate.findMany({
    where: { isActive: true, OR: [{ tenantId: null, locale }, { tenantId }] },
    include: TEMPLATE_DETAIL_INCLUDE,
    orderBy: [{ createdAt: 'asc' }],
  });
  return templates.map(summarize);
}

// null when the template doesn't exist or belongs to another tenant (callers answer 404 either way).
export async function findTemplateForTenant(id: string, tenantId: string) {
  const template = await prisma.projectTemplate.findUnique({ where: { id }, include: TEMPLATE_DETAIL_INCLUDE });
  if (!template || !template.isActive) return null;
  if (template.tenantId !== null && template.tenantId !== tenantId) return null;
  return template;
}

export async function getTemplateDetail(id: string, tenantId: string) {
  const template = await findTemplateForTenant(id, tenantId);
  if (!template) return null;
  return {
    ...summarize(template),
    phases: template.phases.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      taskCount: p.tasks.length,
      tasks: p.tasks.map((t) => ({ id: t.id, title: t.title, description: t.description, dueOffsetDays: t.dueOffsetDays, projectRole: t.projectRole })),
    })),
  };
}

// ---- Creating a project from a template ------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function roleKey(role: string): string {
  return role.trim().toLocaleLowerCase();
}

export interface AssigneeCandidates {
  // project role (as typed) → the employee's login, null when that employee has none
  userIdByRole: Map<string, string | null>;
  ownerUserId: string | null;
  creatorUserId: string;
}

// Task.assigneeId is a login (User), and not every employee has one. A template task goes to the
// team member holding its role if they have a login, else to the project owner if they have one,
// else to whoever created the project. Exported for tests — this is the rule the UI previews.
export function resolveTemplateAssignee(role: string | null, candidates: AssigneeCandidates): { userId: string; fallback: boolean } {
  if (role) {
    const userId = candidates.userIdByRole.get(roleKey(role));
    if (userId) return { userId, fallback: false };
  }
  if (candidates.ownerUserId) return { userId: candidates.ownerUserId, fallback: !!role };
  return { userId: candidates.creatorUserId, fallback: true };
}

export interface InstantiateTemplateInput extends Omit<CreateProjectInput, 'phases' | 'templateId'> {
  templateId: string;
}

export async function instantiateTemplate(input: InstantiateTemplateInput, createdByUserId: string) {
  const template = await findTemplateForTenant(input.templateId, input.tenantId);
  if (!template) throw new Error('Template not found');

  const startDate = input.startDate ?? todayUtc();
  const offsets = template.phases.flatMap((p) => p.tasks.map((t) => t.dueOffsetDays ?? 0));
  const dueDate = input.dueDate ?? (offsets.length ? addDays(startDate, Math.max(...offsets)) : null);

  const employeeIds = [input.ownerEmployeeId, ...(input.members ?? []).map((m) => m.employeeId)];
  const employees = await prisma.employee.findMany({ where: { tenantId: input.tenantId, id: { in: employeeIds } }, select: { id: true, userId: true } });
  const userIdOf = new Map(employees.map((e) => [e.id, e.userId]));
  const userIdByRole = new Map<string, string | null>();
  for (const m of input.members ?? []) {
    if (m.projectRole?.trim() && !userIdByRole.has(roleKey(m.projectRole))) {
      userIdByRole.set(roleKey(m.projectRole), userIdOf.get(m.employeeId) ?? null);
    }
  }
  const candidates: AssigneeCandidates = { userIdByRole, ownerUserId: userIdOf.get(input.ownerEmployeeId) ?? null, creatorUserId: createdByUserId };

  const { project, taskIds } = await prisma.$transaction(async (tx) => {
    const { project, phases } = await createProjectRecords(
      tx,
      {
        ...input,
        startDate,
        dueDate,
        templateId: template.id,
        phases: template.phases.map((p) => ({ name: p.name, color: p.color })),
      },
      createdByUserId,
    );
    // One INSERT for every task (not one round trip each) keeps a 15-task template well inside the
    // interactive transaction's time budget against a remote database.
    const created = await tx.task.createManyAndReturn({
      data: template.phases.flatMap((templatePhase, index) =>
        templatePhase.tasks.map((t) => ({
          tenantId: input.tenantId,
          entityType: 'project' as const,
          entityId: project.id,
          title: t.title,
          description: t.description,
          assigneeId: resolveTemplateAssignee(t.projectRole, candidates).userId,
          dueDate: t.dueOffsetDays === null ? null : addDays(startDate, t.dueOffsetDays),
          createdById: createdByUserId,
          projectPhaseId: phases[index].id,
        })),
      ),
      select: { id: true },
    });
    const taskIds = created.map((t) => t.id);
    return { project, taskIds };
  }, { timeout: 20_000 });

  // One Activity entry for the project ("Created Project …"), not one per copied task — a 15-task
  // template would otherwise bury the feed. Calendar sync runs per task after the commit, awaited
  // (an un-awaited promise can be cut off by Vercel once the response is sent).
  await recordProjectCreated(project, createdByUserId);
  // Only assignees with a connected Google Calendar have anything to sync — one lookup for all of
  // them instead of one per task.
  const tasks = await prisma.task.findMany({ where: { id: { in: taskIds }, dueDate: { not: null } } });
  const connected = await prisma.googleCalendarConnection.findMany({
    where: { userId: { in: [...new Set(tasks.map((t) => t.assigneeId))] }, needsReconnect: false },
    select: { userId: true },
  });
  const connectedUserIds = new Set(connected.map((c) => c.userId));
  for (const task of tasks) {
    if (connectedUserIds.has(task.assigneeId)) await syncTaskCalendarEvent(null, task);
  }

  return getProjectDetail(project.id);
}

// ---- Save as template ------------------------------------------------------------------------

// Copies the project's current shape: phases in order, every task (done or not — a template has
// no progress) with its due date turned into days from the project's start, and its assignee
// turned into that person's role on the team. Tasks with no phase go into one extra last phase.
export async function saveProjectAsTemplate(
  projectId: string,
  input: { name: string; description?: string | null; noPhaseName: string },
  createdByUserId: string,
) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      phases: { orderBy: { order: 'asc' } },
      members: { include: { employee: { select: { userId: true } } } },
    },
  });
  const tasks = await prisma.task.findMany({
    where: { tenantId: project.tenantId, entityType: 'project', entityId: project.id },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
  });

  const roleByUserId = new Map<string, string>();
  for (const m of project.members) {
    if (m.employee.userId && m.projectRole) roleByUserId.set(m.employee.userId, m.projectRole);
  }
  const start = project.startDate ?? project.createdAt;
  const offsetOf = (due: Date | null) => (due ? Math.round((due.getTime() - start.getTime()) / DAY_MS) : null);

  const phases: { name: string; color: string | null; tasks: typeof tasks }[] = project.phases.map((p) => ({
    name: p.name,
    color: p.color,
    tasks: tasks.filter((t) => t.projectPhaseId === p.id),
  }));
  const loose = tasks.filter((t) => !t.projectPhaseId || !project.phases.some((p) => p.id === t.projectPhaseId));
  if (loose.length) phases.push({ name: input.noPhaseName, color: PHASE_COLORS[phases.length % PHASE_COLORS.length], tasks: loose });

  const template = await prisma.projectTemplate.create({
    data: {
      tenantId: project.tenantId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      niche: 'custom',
      createdById: createdByUserId,
      phases: {
        create: phases.map((p, order) => ({
          name: p.name,
          color: p.color,
          order,
          tasks: {
            create: p.tasks.map((t, taskOrder) => ({
              title: t.title,
              description: t.description,
              dueOffsetDays: offsetOf(t.dueDate),
              projectRole: roleByUserId.get(t.assigneeId) ?? null,
              order: taskOrder,
            })),
          },
        })),
      },
    },
  });

  await recordActivity({
    tenantId: project.tenantId,
    entityType: 'projectTemplate',
    entityId: template.id,
    entityLabel: template.name,
    action: 'create',
    changedByUserId: createdByUserId,
    after: template,
    fieldConfig: { name: { label: 'Name' }, description: { label: 'Description' } },
    parentEntityType: 'project',
    parentEntityId: project.id,
  });
  return getTemplateDetail(template.id, project.tenantId);
}

// Tenant templates only (system templates are read-only). Projects made from it keep their
// templateId cleared by the FK (SetNull) — they never depended on it.
export async function deleteTenantTemplate(id: string, tenantId: string, changedByUserId: string) {
  const template = await prisma.projectTemplate.findUniqueOrThrow({ where: { id } });
  await prisma.projectTemplate.delete({ where: { id } });
  await recordActivity({
    tenantId,
    entityType: 'projectTemplate',
    entityId: id,
    entityLabel: template.name,
    action: 'delete',
    changedByUserId,
    before: template,
    fieldConfig: { name: { label: 'Name' }, description: { label: 'Description' } },
  });
}

// ---- Seeding system templates -----------------------------------------------------------------

// Idempotent: one row per (systemKey, locale), updated in place; its phases/tasks are replaced
// wholesale on every run (projects copied from it are unaffected — they never read it again).
export async function seedSystemTemplates(): Promise<{ upserted: number }> {
  let upserted = 0;
  for (const st of SYSTEM_TEMPLATES) {
    for (const locale of SYSTEM_TEMPLATE_LOCALES) {
      await prisma.$transaction(async (tx) => {
        const row = await tx.projectTemplate.upsert({
          where: { systemKey_locale: { systemKey: st.key, locale } },
          create: { systemKey: st.key, locale, name: st.name[locale], description: st.description[locale], niche: st.niche },
          update: { name: st.name[locale], description: st.description[locale], niche: st.niche, isActive: true },
        });
        await tx.projectTemplatePhase.deleteMany({ where: { templateId: row.id } });
        for (const [order, phase] of st.phases.entries()) {
          await tx.projectTemplatePhase.create({
            data: {
              templateId: row.id,
              name: phase.name[locale],
              color: PHASE_COLORS[order % PHASE_COLORS.length],
              order,
              tasks: {
                create: phase.tasks.map((t, taskOrder) => ({
                  title: t.title[locale],
                  dueOffsetDays: t.offset,
                  projectRole: t.role ? t.role[locale] : null,
                  order: taskOrder,
                })),
              },
            },
          });
        }
      }, { timeout: 30_000 });
      upserted += 1;
    }
  }
  return { upserted };
}
