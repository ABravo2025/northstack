import { describe, expect, it, vi } from 'vitest';

let nextFileNumber = 1001;
vi.mock('../src/lib/prisma.js', () => ({
  default: {
    tenant: {
      update: vi.fn(async () => ({ nextFileNumber: ++nextFileNumber })),
    },
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
      departmentId: null,
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
      departmentId: null,
      tenantId: 'tenant-id',
      statusId: 'custom-status-id',
    });

    expect(employee.statusId).toBe('custom-status-id');
  });

  it('gives each new person the next correlative 5-digit file number', async () => {
    nextFileNumber = 1001;
    const first = await createEmployee({ firstName: 'Ana', lastName: 'Lopez', email: 'ana@example.com', departmentId: null, tenantId: 'tenant-id' });
    const second = await createEmployee({ firstName: 'Beto', lastName: 'Diaz', email: 'beto@example.com', departmentId: null, tenantId: 'tenant-id' });
    expect(first.fileNumber).toBe('01001');
    expect(second.fileNumber).toBe('01002');
  });
});
