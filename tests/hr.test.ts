import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    employee: {
      create: vi.fn(async (data) => ({
        id: 'employee-id',
        createdAt: new Date().toISOString(),
        ...data.data,
      })),
    },
    statusDefinition: {
      findFirst: vi.fn(async () => ({ id: 'default-status-id', name: 'Active', isDefault: true })),
    },
  },
}));

import { createEmployee } from '../src/modules/hr/employeeService.js';

describe('HR employee service', () => {
  it('creates an employee with the tenant default status when none is given', async () => {
    const employee = await createEmployee({
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'ana@example.com',
      department: 'Engineering',
      tenantId: 'tenant-id',
    });

    expect(employee.statusId).toBe('default-status-id');
    expect(employee.email).toBe('ana@example.com');
  });

  it('uses the explicit statusId when one is provided', async () => {
    const employee = await createEmployee({
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'ana@example.com',
      department: 'Engineering',
      tenantId: 'tenant-id',
      statusId: 'custom-status-id',
    });

    expect(employee.statusId).toBe('custom-status-id');
  });
});
