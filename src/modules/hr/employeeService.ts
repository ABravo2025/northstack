import prisma from '../../lib/prisma.js';
import type { Employee, EmployeeStatus } from '@prisma/client';

export interface CreateEmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  status?: EmployeeStatus;
  tenantId: string;
}

export interface UpdateEmployeeInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  department?: string;
  status?: EmployeeStatus;
}

export async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  return prisma.employee.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email.toLowerCase(),
      department: input.department,
      status: input.status ?? 'active',
      tenantId: input.tenantId,
    },
  });
}

export async function listEmployees(tenantId?: string | null): Promise<Employee[]> {
  if (!tenantId) {
    return [];
  }

  return prisma.employee.findMany({
    where: { tenantId },
  });
}

export async function findEmployeeById(id: string): Promise<Employee | null> {
  return prisma.employee.findUnique({
    where: { id },
  });
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput): Promise<Employee> {
  return prisma.employee.update({
    where: { id },
    data: input,
  });
}

export async function deleteEmployee(id: string): Promise<void> {
  await prisma.employee.delete({
    where: { id },
  });
}

export function getEmployeeStatusLabel(status: EmployeeStatus): string {
  const labels: Record<EmployeeStatus, string> = {
    active: 'Active',
    inactive: 'Inactive',
    pending: 'Pending',
  };

  return labels[status];
}
