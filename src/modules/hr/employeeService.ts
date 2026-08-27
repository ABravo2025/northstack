import prisma from '../../lib/prisma.js';
import { getDefaultStatusId, recordStatusChange } from './statusService.js';
import { listCustomFieldValuesForEntities } from './customFieldService.js';
import { findActiveTimeOffRequestsForEmployees } from './timeOffRequestService.js';
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

export async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  const statusId = input.statusId ?? (await getDefaultStatusId(input.tenantId, 'employee'));

  return prisma.employee.create({
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
}

// Walks up the reporting chain from `proposedManagerId` to check whether
// assigning it to `employeeId` would create a cycle (direct or indirect).
export async function wouldCreateManagerCycle(
  employeeId: string,
  proposedManagerId: string,
): Promise<boolean> {
  if (employeeId === proposedManagerId) {
    return true;
  }

  let currentId: string | null = proposedManagerId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === employeeId) {
      return true;
    }
    if (visited.has(currentId)) {
      return false;
    }
    visited.add(currentId);

    const manager: { managerId: string | null } | null = await prisma.employee.findUnique({
      where: { id: currentId },
      select: { managerId: true },
    });
    currentId = manager?.managerId ?? null;
  }

  return false;
}

export async function listEmployees(tenantId: string | null | undefined) {
  if (!tenantId) {
    return [];
  }

  const employees = await prisma.employee.findMany({
    where: { tenantId },
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
  const values = await listCustomFieldValuesForEntities(tenantId, 'employee', employeeIds);
  const activeTimeOffRequests = await findActiveTimeOffRequestsForEmployees(tenantId, employeeIds);
  // Separate query for the *current* (effectiveTo: null) compensation, kept
  // apart from the first-ever one above (contractStatus needs the original,
  // not the latest — see the comment on `compensations` in the include).
  // Only Pay Frequency is surfaced here (backlog QA, 2026-08-27 — the list
  // view had no way to sort/filter who's due for which pay run); expand this
  // if another current-compensation field needs to reach the list later.
  const currentCompensations = await prisma.employeeCompensation.findMany({
    where: { employeeId: { in: employeeIds }, effectiveTo: null },
    include: { payFrequency: true },
  });

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

  return updated;
}

export async function deleteEmployee(id: string): Promise<void> {
  await prisma.employee.delete({
    where: { id },
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
