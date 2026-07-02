import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    employee: {
      create: vi.fn(async (data) => ({
        id: 'employee-id',
        createdAt: new Date().toISOString(),
        status: data.data.status ?? 'active',
        ...data.data,
      })),
    },
  },
}));

import { createEmployee, getEmployeeStatusLabel } from '../src/modules/hr/employeeService.js';

describe('HR employee service', () => {
  it('creates an employee with a default active status', async () => {
    const employee = await createEmployee({
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'ana@example.com',
      department: 'Engineering',
    });

    expect(employee.status).toBe('active');
    expect(employee.email).toBe('ana@example.com');
  });

  it('returns a readable status label', () => {
    expect(getEmployeeStatusLabel('active')).toBe('Active');
    expect(getEmployeeStatusLabel('pending')).toBe('Pending');
  });
});
