import prisma from '../../lib/prisma.js';
import { getDefaultStatusId, recordStatusChange } from './statusService.js';
import { listCustomFieldValuesForEntities } from './customFieldService.js';
import type { Employee } from '@prisma/client';

export interface CreateEmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  statusId?: string;
  managerId?: string | null;
  tenantId: string;
}

export interface UpdateEmployeeInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  department?: string;
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
      department: input.department,
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

export async function listEmployees(tenantId?: string | null) {
  if (!tenantId) {
    return [];
  }

  const employees = await prisma.employee.findMany({
    where: { tenantId },
    include: { statusDefn: true, manager: { select: { id: true, firstName: true, lastName: true } } },
  });

  const values = await listCustomFieldValuesForEntities(
    tenantId,
    'employee',
    employees.map((employee) => employee.id),
  );

  return employees.map((employee) => ({
    ...employee,
    customFieldVals: values.filter((value) => value.entityId === employee.id),
  }));
}

export async function findEmployeeById(id: string): Promise<Employee | null> {
  return prisma.employee.findUnique({
    where: { id },
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

  const updated = await prisma.employee.update({
    where: { id },
    data: input,
    include: { statusDefn: true, manager: { select: { id: true, firstName: true, lastName: true } } },
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
