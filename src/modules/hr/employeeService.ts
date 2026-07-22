import prisma from '../../lib/prisma.js';
import { getDefaultStatusId, recordStatusChange } from './statusService.js';
import { listCustomFieldValuesForEntities } from './customFieldService.js';
import { findActiveTimeOffRequestsForEmployees } from './timeOffRequestService.js';
import type { Employee, Prisma } from '@prisma/client';

export interface CreateEmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
  departmentId?: string | null;
  jobTitleId?: string | null;
  hourlyRateCents?: number | null;
  monthlyRateCents?: number | null;
  startDate?: string | null;
  endDate?: string | null;
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
  hourlyRateCents?: number | null;
  monthlyRateCents?: number | null;
  startDate?: string | null;
  endDate?: string | null;
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
      hourlyRateCents: input.hourlyRateCents ?? null,
      monthlyRateCents: input.monthlyRateCents ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
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

// hourlyRateCents/monthlyRateCents are compensation data — for now, visible to
// `owner` only (not even `admin`). This is a deliberate stopgap, not a general
// permissions mechanism: revisit once the custom-roles system exists.
const COMPENSATION_FIELDS = ['hourlyRateCents', 'monthlyRateCents'] as const;

export async function listEmployees(tenantId: string | null | undefined, viewerRole?: string) {
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
    },
  });

  const employeeIds = employees.map((employee) => employee.id);
  const values = await listCustomFieldValuesForEntities(tenantId, 'employee', employeeIds);
  const activeTimeOffRequests = await findActiveTimeOffRequestsForEmployees(tenantId, employeeIds);

  return employees.map((employee) => {
    const activeTimeOff = activeTimeOffRequests.find((request) => request.employeeId === employee.id);
    const result: any = {
      ...employee,
      customFieldVals: values.filter((value) => value.entityId === employee.id),
      activeTimeOffTag: activeTimeOff
        ? { policyName: activeTimeOff.timeOffPolicy.name, color: activeTimeOff.timeOffPolicy.color }
        : null,
    };

    if (viewerRole !== 'owner') {
      for (const field of COMPENSATION_FIELDS) {
        delete result[field];
      }
    }

    return result;
  });
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
  if (input.hourlyRateCents !== undefined) data.hourlyRateCents = input.hourlyRateCents;
  if (input.monthlyRateCents !== undefined) data.monthlyRateCents = input.monthlyRateCents;
  if (input.startDate !== undefined) data.startDate = input.startDate ? new Date(input.startDate) : null;
  if (input.endDate !== undefined) data.endDate = input.endDate ? new Date(input.endDate) : null;
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
