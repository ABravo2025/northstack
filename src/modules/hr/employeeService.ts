import prisma from '../../lib/prisma.js';
import { getDefaultStatusId, recordStatusChange } from './statusService.js';
import { listCustomFieldValuesForEntities } from './customFieldService.js';
import { findActiveTimeOffRequestsForEmployees } from './timeOffRequestService.js';
import { listTagsForEntities } from '../crossModule/tagService.js';
import { wouldCreateCycle } from '../../lib/cycleDetection.js';
import { recordActivity } from '../activity/activityLogService.js';
import { employeeActivityFieldConfig, employeeDisplayName } from '../activity/fieldConfigs/employeeFieldConfig.js';
import { getEmployeeScope } from '../auth/roleService.js';
import type { RoleContext } from '../auth/roleService.js';
import type { ContractType, Employee, PersonType, Prisma } from '@prisma/client';

export interface CreateEmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
  departmentId?: string | null;
  jobTitleId?: string | null;
  contractType?: ContractType | null;
  personType?: PersonType | null;
  nationality?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  birthdate?: string | null;
  contractUrl?: string | null;
  personalEmail?: string | null;
  statusId?: string;
  managerId?: string | null;
  tenantId: string;
}

export interface UpdateEmployeeInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  departmentId?: string | null;
  jobTitleId?: string | null;
  contractType?: ContractType | null;
  personType?: PersonType | null;
  nationality?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  birthdate?: string | null;
  contractUrl?: string | null;
  personalEmail?: string | null;
  statusId?: string;
  managerId?: string | null;
}

// changedByUserId is optional — every caller with a real authenticated actor (the route, CSV
// import, onboarding sample data) passes it; publicFormService.ts's anonymous form submission
// path doesn't (there's no User behind a public form fill-out), and simply doesn't get an Activity
// Log entry — a deliberate scope cut, see docs/general/spec-activity-log.md.
export async function createEmployee(input: CreateEmployeeInput, changedByUserId?: string): Promise<Employee> {
  const statusId = input.statusId ?? (await getDefaultStatusId(input.tenantId, 'employee'));

  const employee = await prisma.employee.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email.toLowerCase(),
      departmentId: input.departmentId ?? null,
      jobTitleId: input.jobTitleId ?? null,
      contractType: input.contractType ?? null,
      personType: input.personType ?? null,
      nationality: input.nationality ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      birthdate: input.birthdate ? new Date(input.birthdate) : null,
      contractUrl: input.contractUrl ?? null,
      personalEmail: input.personalEmail ?? null,
      statusId,
      managerId: input.managerId ?? null,
      tenantId: input.tenantId,
    },
  });

  if (changedByUserId) {
    await recordActivity({
      tenantId: input.tenantId,
      entityType: 'employee',
      entityId: employee.id,
      entityLabel: employeeDisplayName(employee),
      action: 'create',
      changedByUserId,
      after: employee,
      fieldConfig: employeeActivityFieldConfig,
    });
  }

  return employee;
}

// Walks up the reporting chain from `proposedManagerId` to check whether
// assigning it to `employeeId` would create a cycle (direct or indirect).
export async function wouldCreateManagerCycle(
  employeeId: string,
  proposedManagerId: string,
): Promise<boolean> {
  return wouldCreateCycle(employeeId, proposedManagerId, async (id) => {
    const manager = await prisma.employee.findUnique({ where: { id }, select: { managerId: true } });
    return manager?.managerId ?? null;
  });
}

// Custom Roles Fase E — the `department` HR scope is the union of two criteria (decision 5 in the
// plan): everyone sharing the acting employee's own `departmentId` catalog value, PLUS everyone in
// their reporting chain (direct + indirect reports), the inverse walk of `wouldCreateManagerCycle`
// above (that one walks UP toward the root to detect a cycle; this one walks DOWN from a manager to
// find every descendant). Resolved with one full-tenant `{id, managerId, departmentId}` fetch and an
// in-memory BFS rather than N recursive queries — tenants are expected to have tens/hundreds of
// employees, not thousands (same assumption the plan makes explicitly).
export async function getManagedEmployeeIds(tenantId: string, employeeId: string): Promise<Set<string>> {
  const all = await prisma.employee.findMany({
    where: { tenantId },
    select: { id: true, managerId: true, departmentId: true },
  });

  const visible = new Set<string>([employeeId]);
  const self = all.find((e) => e.id === employeeId);
  if (self?.departmentId) {
    for (const e of all) {
      if (e.departmentId === self.departmentId) {
        visible.add(e.id);
      }
    }
  }

  const directReportsByManagerId = new Map<string, string[]>();
  for (const e of all) {
    if (e.managerId) {
      const siblings = directReportsByManagerId.get(e.managerId);
      if (siblings) siblings.push(e.id);
      else directReportsByManagerId.set(e.managerId, [e.id]);
    }
  }

  const queue = [employeeId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const reportId of directReportsByManagerId.get(currentId) ?? []) {
      if (!visible.has(reportId)) {
        visible.add(reportId);
        queue.push(reportId);
      }
    }
  }

  return visible;
}

// Single entry point for "which Employee rows can this role's acting user see" — used by both
// listEmployees (filters the list) and the detail/edit/delete routes (membership check, 404 if
// not present). Returns `null` for scope `all` (the caller skips filtering entirely rather than
// fetching every id just to filter nothing out). An acting user with no linked Employee record of
// their own (a User with no `Employee.userId` back-reference) has no rows of their own to resolve
// `self`/`department` against — per the plan, that's treated as "nothing beyond the directory
// tier," not an error, so it resolves to an empty set rather than throwing.
export async function resolveVisibleEmployeeIds(
  tenantId: string,
  role: RoleContext,
  actingUserId: string,
): Promise<Set<string> | null> {
  const scope = getEmployeeScope(role);
  if (scope === 'all') {
    return null;
  }

  const actingEmployee = await findEmployeeByUserId(actingUserId);
  if (!actingEmployee) {
    return new Set();
  }

  if (scope === 'self') {
    return new Set([actingEmployee.id]);
  }
  if (scope === 'department') {
    return getManagedEmployeeIds(tenantId, actingEmployee.id);
  }
  return new Set(); // 'none' — no view_employee_scope:* permission at all
}

// Custom Roles Fase E, decision 6 — the "directory tier": name, department, job title, and manager
// stay visible to every tenant member regardless of their HR scope (or even whether they have any
// Employee/HR permission at all — this is intentionally NOT gated by canViewEmployee, see
// routes/employees.ts). Feeds manager pickers, the Task "who is this for" entity picker, and
// termination reassignment pickers — surfaces that need to point at anyone in the company, not just
// whoever is inside the caller's own scope. Never includes PII (personalEmail, birthdate,
// nationality, contractUrl, etc.) — those stay behind the real listEmployees/findEmployeeById scope
// + field-level restriction.
export async function listEmployeeDirectory(tenantId: string | null | undefined) {
  if (!tenantId) {
    return [];
  }

  return prisma.employee.findMany({
    where: { tenantId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      departmentId: true,
      departmentDefn: { select: { id: true, name: true } },
      jobTitleId: true,
      jobTitleDefn: { select: { id: true, name: true } },
      managerId: true,
      manager: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
}

export async function listEmployees(tenantId: string | null | undefined, visibleIds?: Set<string> | null) {
  if (!tenantId) {
    return [];
  }

  const employees = await prisma.employee.findMany({
    where: { tenantId, ...(visibleIds ? { id: { in: Array.from(visibleIds) } } : {}) },
    include: {
      statusDefn: true,
      departmentDefn: true,
      jobTitleDefn: true,
      manager: { select: { id: true, firstName: true, lastName: true } },
      timeOffPolicies: { include: { timeOffPolicy: true } },
      // Only need the very first-ever compensation (not the current/latest
      // one) to compute contractStatus below — a reassignment (Unidad 10)
      // never re-confirms, so checking the *latest* row's confirmedAt would
      // wrongly flag an already-active person as pending/expired forever.
      compensations: { orderBy: { createdAt: 'asc' }, take: 1 },
    },
  });

  const employeeIds = employees.map((employee) => employee.id);
  // Independent queries — none reads another's result, so they run concurrently instead of paying
  // for 4 sequential Neon round-trips.
  const [values, activeTimeOffRequests, currentCompensations, tags] = await Promise.all([
    listCustomFieldValuesForEntities(tenantId, 'employee', employeeIds),
    findActiveTimeOffRequestsForEmployees(tenantId, employeeIds),
    // Separate query for the *current* (effectiveTo: null) compensation, kept
    // apart from the first-ever one above (contractStatus needs the original,
    // not the latest — see the comment on `compensations` in the include).
    // Only Pay Frequency is surfaced here (backlog QA, 2026-08-27 — the list
    // view had no way to sort/filter who's due for which pay run); expand this
    // if another current-compensation field needs to reach the list later.
    prisma.employeeCompensation.findMany({
      where: { employeeId: { in: employeeIds }, effectiveTo: null },
      include: { payFrequency: true },
    }),
    listTagsForEntities(tenantId, 'employee', employeeIds),
  ]);

  return employees.map((employee) => {
    const activeTimeOff = activeTimeOffRequests.find((request) => request.employeeId === employee.id);
    const currentCompensation = currentCompensations.find((c) => c.employeeId === employee.id);
    const { compensations, ...employeeFields } = employee;
    const result: any = {
      ...employeeFields,
      customFieldVals: values.filter((value) => value.entityId === employee.id),
      activeTimeOffTag: activeTimeOff
        ? { policyName: activeTimeOff.timeOffPolicy.name, color: activeTimeOff.timeOffPolicy.color }
        : null,
      contractStatus: computeContractStatus(employee.personType, employee.userId, compensations[0]),
      payFrequencyName: currentCompensation?.payFrequency.name ?? null,
      tags: tags.filter((tag) => tag.entityId === employee.id),
    };

    return result;
  });
}

// Payroll Unidad 11 — 'sin_compensacion'/'confirmado'/'pendiente'/'vencido',
// or null for Profile (not applicable at all, not just an empty state).
// "vencido" = pending for more than 3 days since the first contract was
// created.
const CONTRACT_EXPIRY_DAYS = 3;

function computeContractStatus(
  personType: PersonType | null,
  userId: string | null,
  firstCompensation: { createdAt: Date } | undefined,
): 'sin_compensacion' | 'confirmado' | 'pendiente' | 'vencido' | null {
  if (personType !== 'contractor' && personType !== 'employee') {
    return null;
  }
  if (!firstCompensation) {
    return 'sin_compensacion';
  }
  if (userId) {
    return 'confirmado';
  }
  const ageMs = Date.now() - firstCompensation.createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays > CONTRACT_EXPIRY_DAYS ? 'vencido' : 'pendiente';
}

export async function findEmployeeById(id: string): Promise<Employee | null> {
  return prisma.employee.findUnique({
    where: { id },
  });
}

export async function findEmployeeByUserId(userId: string): Promise<Employee | null> {
  return prisma.employee.findUnique({
    where: { userId },
  });
}

export async function updateEmployee(
  id: string,
  input: UpdateEmployeeInput,
  changedByUserId: string,
): Promise<Employee> {
  const existing = await prisma.employee.findUniqueOrThrow({
    where: { id },
    include: { statusDefn: true },
  });

  // Whitelist explicitly — never pass the input object straight through, since it
  // may originate from req.body and carry extra fields (e.g. tenantId) that would
  // otherwise reassign this row across tenants.
  const data: Prisma.EmployeeUncheckedUpdateInput = {};
  if (input.firstName !== undefined) data.firstName = input.firstName;
  if (input.lastName !== undefined) data.lastName = input.lastName;
  if (input.email !== undefined) data.email = input.email.toLowerCase();
  if (input.departmentId !== undefined) data.departmentId = input.departmentId;
  if (input.jobTitleId !== undefined) data.jobTitleId = input.jobTitleId;
  if (input.contractType !== undefined) data.contractType = input.contractType;
  if (input.personType !== undefined) data.personType = input.personType;
  if (input.nationality !== undefined) data.nationality = input.nationality;
  if (input.startDate !== undefined) data.startDate = input.startDate ? new Date(input.startDate) : null;
  if (input.endDate !== undefined) data.endDate = input.endDate ? new Date(input.endDate) : null;
  if (input.birthdate !== undefined) data.birthdate = input.birthdate ? new Date(input.birthdate) : null;
  if (input.contractUrl !== undefined) data.contractUrl = input.contractUrl;
  if (input.personalEmail !== undefined) data.personalEmail = input.personalEmail;
  if (input.statusId !== undefined) data.statusId = input.statusId;
  if (input.managerId !== undefined) data.managerId = input.managerId;

  const updated = await prisma.employee.update({
    where: { id },
    data,
    include: {
      statusDefn: true,
      departmentDefn: true,
      jobTitleDefn: true,
      manager: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  if (input.statusId && input.statusId !== existing.statusId) {
    await recordStatusChange({
      tenantId: existing.tenantId,
      entityType: 'employee',
      entityId: id,
      fromStatusName: existing.statusDefn.name,
      toStatusName: updated.statusDefn.name,
      changedByUserId,
    });
  }

  await recordActivity({
    tenantId: existing.tenantId,
    entityType: 'employee',
    entityId: id,
    entityLabel: employeeDisplayName(updated),
    action: 'update',
    changedByUserId,
    before: existing,
    after: updated,
    fieldConfig: employeeActivityFieldConfig,
  });

  return updated;
}

export async function deleteEmployee(id: string, changedByUserId: string): Promise<void> {
  const existing = await prisma.employee.findUniqueOrThrow({ where: { id } });

  await prisma.employee.delete({
    where: { id },
  });

  await recordActivity({
    tenantId: existing.tenantId,
    entityType: 'employee',
    entityId: id,
    entityLabel: employeeDisplayName(existing),
    action: 'delete',
    changedByUserId,
    before: existing,
    fieldConfig: employeeActivityFieldConfig,
  });
}

// Every employee with a birthdate set, for the Overview calendar's recurring
// annual entries — mirrors listTasksForCalendar/listTimeOffRequestsForCalendar's
// "return everything, let the frontend filter to the visible month" convention.
export async function listEmployeeBirthdaysForCalendar(tenantId: string) {
  return prisma.employee.findMany({
    where: { tenantId, birthdate: { not: null } },
    select: { id: true, firstName: true, lastName: true, birthdate: true },
  });
}
