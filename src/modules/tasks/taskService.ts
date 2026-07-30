import prisma from '../../lib/prisma.js';
import { findEntityTenantId, isSupportedCrossModuleEntityType } from '../crossModule/entityLookup.js';
import type { EntityType, Prisma } from '@prisma/client';

export { findEntityTenantId };
export const isSupportedTaskEntityType = isSupportedCrossModuleEntityType;

export interface CreateTaskInput {
  tenantId: string;
  entityType: EntityType;
  entityId: string;
  title: string;
  description?: string | null;
  assigneeId: string;
  dueDate?: Date | string | null;
  createdById: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  assigneeId?: string;
  dueDate?: Date | string | null;
  completedAt?: Date | string | null;
}

const taskInclude = {
  assignee: { select: { id: true, firstName: true, lastName: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.TaskInclude;

export async function createTask(input: CreateTaskInput) {
  return prisma.task.create({
    data: {
      tenantId: input.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      title: input.title,
      description: input.description ?? null,
      assigneeId: input.assigneeId,
      dueDate: input.dueDate ?? null,
      createdById: input.createdById,
    },
    include: taskInclude,
  });
}

export async function findTaskById(id: string) {
  return prisma.task.findUnique({ where: { id }, include: taskInclude });
}

export async function listTasksForEntity(tenantId: string, entityType: EntityType, entityId: string) {
  return prisma.task.findMany({
    where: { tenantId, entityType, entityId },
    include: taskInclude,
    orderBy: { createdAt: 'asc' },
  });
}

export async function updateTask(id: string, input: UpdateTaskInput) {
  // Whitelist explicitly — never spread req.body straight through (same rule
  // as every other update service in the app, since it may carry a tenantId/
  // entityId the caller shouldn't be able to reassign).
  const data: Prisma.TaskUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.assigneeId !== undefined) data.assigneeId = input.assigneeId;
  if (input.dueDate !== undefined) data.dueDate = input.dueDate;
  if (input.completedAt !== undefined) data.completedAt = input.completedAt;

  return prisma.task.update({ where: { id }, data, include: taskInclude });
}

export async function deleteTask(id: string): Promise<void> {
  await prisma.task.delete({ where: { id } });
}

// "Mine": pending tasks first (completedAt null), by soonest dueDate, nulls
// (no due date) last — sorted in code rather than relying on a Prisma
// nulls-ordering preview feature not otherwise used in this project.
export async function listMyTasks(tenantId: string, assigneeId: string) {
  const tasks = await prisma.task.findMany({
    where: { tenantId, assigneeId },
    include: {
      ...taskInclude,
    },
  });

  const entitySummaries = await summarizeTaskEntities(tenantId, tasks);

  const withSummary = tasks.map((task) => ({
    ...task,
    entitySummary: entitySummaries.get(`${task.entityType}:${task.entityId}`) ?? null,
  }));

  return withSummary.sort((a, b) => {
    if (!!a.completedAt !== !!b.completedAt) {
      return a.completedAt ? 1 : -1;
    }
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.getTime() - b.dueDate.getTime();
  });
}

// Every Task with a dueDate for the tenant — mirrors the existing Time Off
// calendar endpoint's convention of returning everything and letting the
// frontend filter to the visible month, rather than taking a date-range param.
export async function listTasksForCalendar(tenantId: string) {
  const tasks = await prisma.task.findMany({
    where: { tenantId, dueDate: { not: null } },
    include: taskInclude,
    orderBy: { dueDate: 'asc' },
  });

  const entitySummaries = await summarizeTaskEntities(tenantId, tasks);

  return tasks.map((task) => ({
    ...task,
    entitySummary: entitySummaries.get(`${task.entityType}:${task.entityId}`) ?? null,
  }));
}

// Resolves a readable label per (entityType, entityId) so the frontend doesn't
// have to fetch Company/Contact/Employee/Opportunity separately just to show
// "which record is this task about" in "My tasks"/the calendar.
async function summarizeTaskEntities(
  tenantId: string,
  tasks: { entityType: EntityType; entityId: string }[],
): Promise<Map<string, string>> {
  const idsByType = new Map<EntityType, Set<string>>();
  for (const task of tasks) {
    if (!idsByType.has(task.entityType)) {
      idsByType.set(task.entityType, new Set());
    }
    idsByType.get(task.entityType)!.add(task.entityId);
  }

  const summaries = new Map<string, string>();

  const employeeIds = [...(idsByType.get('employee') ?? [])];
  if (employeeIds.length > 0) {
    const employees = await prisma.employee.findMany({
      where: { tenantId, id: { in: employeeIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    for (const employee of employees) {
      summaries.set(`employee:${employee.id}`, `${employee.firstName} ${employee.lastName}`);
    }
  }

  const companyIds = [...(idsByType.get('company') ?? [])];
  if (companyIds.length > 0) {
    const companies = await prisma.company.findMany({
      where: { tenantId, id: { in: companyIds } },
      select: { id: true, name: true },
    });
    for (const company of companies) {
      summaries.set(`company:${company.id}`, company.name);
    }
  }

  const contactIds = [...(idsByType.get('contact') ?? [])];
  if (contactIds.length > 0) {
    const contacts = await prisma.contact.findMany({
      where: { tenantId, id: { in: contactIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    for (const contact of contacts) {
      summaries.set(`contact:${contact.id}`, `${contact.firstName} ${contact.lastName}`);
    }
  }

  const opportunityIds = [...(idsByType.get('opportunity') ?? [])];
  if (opportunityIds.length > 0) {
    const opportunities = await prisma.opportunity.findMany({
      where: { tenantId, id: { in: opportunityIds } },
      select: { id: true, name: true },
    });
    for (const opportunity of opportunities) {
      summaries.set(`opportunity:${opportunity.id}`, opportunity.name);
    }
  }

  return summaries;
}
