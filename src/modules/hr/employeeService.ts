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
  tenantId: string;
}

export interface UpdateEmployeeInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  department?: string;
  statusId?: string;
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
      tenantId: input.tenantId,
    },
  });
}

export async function listEmployees(tenantId?: string | null) {
  if (!tenantId) {
    return [];
  }

  const employees = await prisma.employee.findMany({
    where: { tenantId },
    include: { statusDefn: true },
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
    include: { statusDefn: true },
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
