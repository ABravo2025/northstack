import { beforeEach, describe, expect, it, vi } from 'vitest';

const assignmentFindMany = vi.fn();
const requestFindMany = vi.fn();

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    employeeTimeOffPolicy: { findMany: (...args: unknown[]) => assignmentFindMany(...args) },
    timeOffRequest: { findMany: (...args: unknown[]) => requestFindMany(...args) },
    // 2026-10 rules: manual adjustments and year-end closes (none in these fixtures).
    timeOffAdjustment: { findMany: async () => [] },
    timeOffYearClose: { findMany: async () => [], createMany: async () => ({ count: 0 }) },
  },
}));

import { calculateTeamTimeOffBalances } from '../src/modules/hr/timeOffBalanceService.js';
import { listTeamTimeOffRequests } from '../src/modules/hr/timeOffRequestService.js';

describe('Time Off team scope', () => {
  beforeEach(() => {
    assignmentFindMany.mockReset();
    requestFindMany.mockReset();
  });

  it('limits team balances to the manager’s direct reports in the same tenant', async () => {
    assignmentFindMany.mockResolvedValue([
      {
        employeeId: 'report-1',
        employee: { firstName: 'Ana', lastName: 'Paz' },
        timeOffPolicyId: 'vac',
        timeOffPolicy: { name: 'Vacaciones', color: null, accrualMethod: 'fixed_annual', daysPerYear: 14 },
        assignedAt: new Date('2026-01-01'),
      },
    ]);
    requestFindMany.mockResolvedValue([
      { employeeId: 'report-1', timeOffPolicyId: 'vac', status: 'approved', daysRequested: 3 },
      { employeeId: 'report-1', timeOffPolicyId: 'vac', status: 'pending', daysRequested: 2 },
    ]);

    const balances = await calculateTeamTimeOffBalances('tenant-1', 'manager-1');

    expect(assignmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1', employee: { managerId: 'manager-1' } } }),
    );
    expect(balances).toHaveLength(1);
    expect(balances[0]).toMatchObject({ employeeId: 'report-1', allocated: 14, used: 3, pending: 2, remaining: 11 });
  });

  it('limits team request history to the manager’s direct reports in the same tenant', async () => {
    requestFindMany.mockResolvedValue([]);

    await listTeamTimeOffRequests('tenant-1', 'manager-1');

    expect(requestFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1', employee: { managerId: 'manager-1' } } }),
    );
  });
});
