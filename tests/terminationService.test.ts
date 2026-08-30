import { beforeEach, describe, expect, it, vi } from 'vitest';

let employees: any[] = [];
let statusDefinitions: any[] = [];
let employeeCompensations: any[] = [];
let users: any[] = [];
let timeOffRequests: any[] = [];
let employeeTerminations: any[] = [];
let terminationIdSeq = 0;
let statusIdSeq = 0;

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    employee: {
      findUnique: vi.fn(async ({ where }: any) => employees.find((e) => e.id === where.id) ?? null),
      findMany: vi.fn(async ({ where }: any) => employees.filter((e) => e.managerId === where.managerId)),
      update: vi.fn(async ({ where, data }: any) => {
        const e = employees.find((e) => e.id === where.id);
        if (!e) throw new Error('employee not found');
        Object.assign(e, data);
        return e;
      }),
    },
    statusDefinition: {
      findFirst: vi.fn(async ({ where }: any) =>
        statusDefinitions.find(
          (s) =>
            s.tenantId === where.tenantId &&
            s.entityType === where.entityType &&
            (where.name === undefined || s.name === where.name) &&
            (where.isDefault === undefined || s.isDefault === where.isDefault) &&
            (where.isTerminatedStatus === undefined || Boolean(s.isTerminatedStatus) === where.isTerminatedStatus),
        ) ?? null,
      ),
      aggregate: vi.fn(async ({ where }: any) => {
        const matches = statusDefinitions.filter((s) => s.tenantId === where.tenantId && s.entityType === where.entityType);
        return { _max: { order: matches.length ? Math.max(...matches.map((s) => s.order)) : null } };
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `status-${++statusIdSeq}`, ...data };
        statusDefinitions.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const s = statusDefinitions.find((s) => s.id === where.id);
        if (!s) throw new Error('status not found');
        Object.assign(s, data);
        return s;
      }),
    },
    employeeCompensation: {
      findFirst: vi.fn(async ({ where }: any) =>
        employeeCompensations.find((c) => c.employeeId === where.employeeId && c.effectiveTo === null) ?? null,
      ),
      update: vi.fn(async ({ where, data }: any) => {
        const c = employeeCompensations.find((c) => c.id === where.id);
        Object.assign(c, data);
        return c;
      }),
    },
    user: {
      update: vi.fn(async ({ where, data }: any) => {
        const u = users.find((u) => u.id === where.id);
        if (!u) throw new Error('user not found');
        Object.assign(u, data);
        return u;
      }),
    },
    timeOffRequest: {
      findMany: vi.fn(async ({ where }: any) =>
        timeOffRequests.filter(
          (r) =>
            r.employeeId === where.employeeId &&
            where.OR.some((cond: any) =>
              cond.status === 'pending' ? r.status === 'pending' : r.status === 'approved' && r.startDate >= cond.startDate.gte,
            ),
        ),
      ),
      update: vi.fn(async ({ where, data }: any) => {
        const r = timeOffRequests.find((r) => r.id === where.id);
        Object.assign(r, data);
        return r;
      }),
    },
    employeeTermination: {
      findFirst: vi.fn(async ({ where }: any) => {
        const matches = employeeTerminations
          .filter((t) => t.employeeId === where.employeeId && (where.cancelledAt === null ? t.cancelledAt === null : true))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return matches[0] ?? null;
      }),
      findMany: vi.fn(async ({ where }: any) =>
        employeeTerminations.filter(
          (t) => t.terminationDate.getTime() <= where.terminationDate.lte.getTime() && t.executedAt === null && t.cancelledAt === null,
        ),
      ),
      findUnique: vi.fn(async ({ where }: any) => employeeTerminations.find((t) => t.id === where.id) ?? null),
      findUniqueOrThrow: vi.fn(async ({ where }: any) => {
        const t = employeeTerminations.find((t) => t.id === where.id);
        if (!t) throw new Error('termination not found');
        return t;
      }),
      create: vi.fn(async ({ data }: any) => {
        const { reassignments, ...rest } = data;
        const id = `term-${++terminationIdSeq}`;
        const row = {
          id,
          ...rest,
          executedAt: null,
          cancelledAt: null,
          reassignments: (reassignments?.create ?? []).map((r: any, i: number) => ({ id: `reassign-${id}-${i}`, terminationId: id, ...r })),
        };
        employeeTerminations.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const t = employeeTerminations.find((t) => t.id === where.id);
        if (!t) throw new Error('termination not found');
        Object.assign(t, data);
        return t;
      }),
    },
  },
}));

const { createOffPaymentsMock } = vi.hoisted(() => {
  let entrySeq = 0;
  return {
    createOffPaymentsMock: vi.fn(async (input: any) =>
      input.entries.map((e: any) => ({ employeeId: e.employeeId, entryId: `entry-${++entrySeq}` })),
    ),
  };
});
vi.mock('../src/modules/hr/payrollOffPaymentService.js', () => ({
  createOffPayments: createOffPaymentsMock,
}));

const { syncTimeOffCalendarEventMock } = vi.hoisted(() => ({
  syncTimeOffCalendarEventMock: vi.fn(async () => {}),
}));
vi.mock('../src/modules/integrations/googleCalendarSyncService.js', () => ({
  syncTimeOffCalendarEvent: syncTimeOffCalendarEventMock,
}));

import {
  cancelTermination,
  createTermination,
  getLatestTermination,
  listDirectReports,
  runScheduledTerminations,
} from '../src/modules/hr/terminationService.js';

function activeStatus(tenantId: string) {
  return { id: 'status-active', tenantId, entityType: 'employee', name: 'Active', order: 0, isDefault: true };
}

function baseEmployee(overrides: Partial<any> = {}) {
  return {
    id: 'e1',
    tenantId: 't1',
    firstName: 'Jane',
    lastName: 'Doe',
    statusId: 'status-active',
    managerId: null,
    userId: null,
    endDate: null,
    ...overrides,
  };
}

function resetMocks() {
  employees = [baseEmployee()];
  statusDefinitions = [activeStatus('t1')];
  employeeCompensations = [];
  users = [];
  timeOffRequests = [];
  employeeTerminations = [];
  createOffPaymentsMock.mockClear();
  syncTimeOffCalendarEventMock.mockClear();
}

describe('createTermination — immediate (today/past)', () => {
  beforeEach(resetMocks);

  it('applies every effect synchronously when the date is today', async () => {
    const result = await createTermination({
      tenantId: 't1',
      employeeId: 'e1',
      terminationDate: new Date().toISOString().slice(0, 10),
      revokeAccess: false,
      createdByUserId: 'u1',
    });

    expect(result.executedNow).toBe(true);
    expect(result.termination.executedAt).not.toBeNull();
    const employee = employees.find((e) => e.id === 'e1');
    expect(employee.statusId).not.toBe('status-active');
    expect(statusDefinitions.find((s) => s.id === employee.statusId)?.name).toBe('Terminated');
    expect(employee.endDate).not.toBeNull();
  });

  it('creates the "Terminated" status on demand, without touching isDefault', async () => {
    await createTermination({
      tenantId: 't1',
      employeeId: 'e1',
      terminationDate: '2026-01-01',
      revokeAccess: false,
      createdByUserId: 'u1',
    });

    const terminated = statusDefinitions.find((s) => s.name === 'Terminated');
    expect(terminated).toBeTruthy();
    expect(terminated.isDefault).toBe(false);
    // reuses the same row on a second termination elsewhere instead of creating a duplicate
    employees.push(baseEmployee({ id: 'e2' }));
    await createTermination({
      tenantId: 't1',
      employeeId: 'e2',
      terminationDate: '2026-01-02',
      revokeAccess: false,
      createdByUserId: 'u1',
    });
    expect(statusDefinitions.filter((s) => s.name === 'Terminated')).toHaveLength(1);
  });

  it('closes the open compensation row at the termination date', async () => {
    employeeCompensations = [{ id: 'comp-1', employeeId: 'e1', effectiveTo: null }];

    await createTermination({
      tenantId: 't1',
      employeeId: 'e1',
      terminationDate: '2026-03-15',
      revokeAccess: false,
      createdByUserId: 'u1',
    });

    expect(employeeCompensations[0].effectiveTo).toEqual(new Date('2026-03-15'));
  });

  it('does nothing to compensation when the employee never had an open row', async () => {
    await expect(
      createTermination({ tenantId: 't1', employeeId: 'e1', terminationDate: '2026-01-01', revokeAccess: false, createdByUserId: 'u1' }),
    ).resolves.toBeTruthy();
    expect(employeeCompensations).toHaveLength(0);
  });

  it('revokes login access only when revokeAccess is true and the employee has a User', async () => {
    employees = [baseEmployee({ userId: 'user-1' })];
    users = [{ id: 'user-1', status: 'active' }];

    await createTermination({ tenantId: 't1', employeeId: 'e1', terminationDate: '2026-01-01', revokeAccess: true, createdByUserId: 'u1' });

    expect(users[0].status).toBe('inactive');
  });

  it('leaves login access untouched when revokeAccess is false', async () => {
    employees = [baseEmployee({ userId: 'user-1' })];
    users = [{ id: 'user-1', status: 'active' }];

    await createTermination({ tenantId: 't1', employeeId: 'e1', terminationDate: '2026-01-01', revokeAccess: false, createdByUserId: 'u1' });

    expect(users[0].status).toBe('active');
  });

  it('cancels pending Time Off requests and future-dated approved ones, leaves past-approved alone', async () => {
    timeOffRequests = [
      { id: 'r1', employeeId: 'e1', status: 'pending', startDate: new Date('2026-06-01') },
      { id: 'r2', employeeId: 'e1', status: 'approved', startDate: new Date('2026-06-01') }, // future relative to termination
      { id: 'r3', employeeId: 'e1', status: 'approved', startDate: new Date('2026-01-01') }, // before termination date
    ];

    await createTermination({ tenantId: 't1', employeeId: 'e1', terminationDate: '2026-03-01', revokeAccess: false, createdByUserId: 'u1' });

    expect(timeOffRequests.find((r) => r.id === 'r1')!.status).toBe('cancelled');
    expect(timeOffRequests.find((r) => r.id === 'r2')!.status).toBe('cancelled');
    expect(timeOffRequests.find((r) => r.id === 'r3')!.status).toBe('approved');
    expect(syncTimeOffCalendarEventMock).toHaveBeenCalledTimes(2);
  });

  it('reassigns direct reports to their chosen manager, and clears the rest to null', async () => {
    employees = [
      baseEmployee({ id: 'e1' }),
      baseEmployee({ id: 'r1', managerId: 'e1' }),
      baseEmployee({ id: 'r2', managerId: 'e1' }),
    ];

    await createTermination({
      tenantId: 't1',
      employeeId: 'e1',
      terminationDate: '2026-01-01',
      revokeAccess: false,
      createdByUserId: 'u1',
      reassignments: [{ reportEmployeeId: 'r1', newManagerId: 'r2' }],
    });

    expect(employees.find((e) => e.id === 'r1')!.managerId).toBe('r2');
    expect(employees.find((e) => e.id === 'r2')!.managerId).toBeNull();
  });

  it('creates an off-cycle final payment immediately and links it on the termination record', async () => {
    const result = await createTermination({
      tenantId: 't1',
      employeeId: 'e1',
      terminationDate: '2026-01-01',
      revokeAccess: false,
      createdByUserId: 'u1',
      finalPayment: { amountCents: 50000, currency: 'USD', paymentDate: '2026-01-15', label: 'Severance' },
    });

    expect(createOffPaymentsMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', type: 'base', paymentDate: '2026-01-15' }),
    );
    expect(result.termination.finalPaymentEntryIds).toHaveLength(1);
  });

  it('creates one PayrollEntry per additional line (bonus/commission/reimbursement/deduction), same adjustment types as a normal payroll run', async () => {
    const result = await createTermination({
      tenantId: 't1',
      employeeId: 'e1',
      terminationDate: '2026-01-01',
      revokeAccess: false,
      createdByUserId: 'u1',
      finalPayment: {
        amountCents: 50000,
        currency: 'USD',
        paymentDate: '2026-01-15',
        label: 'Severance',
        additionalLines: [
          { type: 'bonus', amountCents: 10000, label: 'Retention bonus' },
          { type: 'deduction', amountCents: -2000, label: 'Equipment not returned' },
        ],
      },
    });

    expect(createOffPaymentsMock).toHaveBeenCalledTimes(3);
    expect(createOffPaymentsMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'base', paymentDate: '2026-01-15' }));
    expect(createOffPaymentsMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'bonus', paymentDate: '2026-01-15' }));
    expect(createOffPaymentsMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'deduction', paymentDate: '2026-01-15' }));
    expect(result.termination.finalPaymentEntryIds).toHaveLength(3);
  });

  it('rejects terminating an employee who is already terminated', async () => {
    await createTermination({ tenantId: 't1', employeeId: 'e1', terminationDate: '2026-01-01', revokeAccess: false, createdByUserId: 'u1' });

    await expect(
      createTermination({ tenantId: 't1', employeeId: 'e1', terminationDate: '2026-02-01', revokeAccess: false, createdByUserId: 'u1' }),
    ).rejects.toThrow(/already terminated/);
  });

  it('rejects a second termination while one is already scheduled and pending', async () => {
    await createTermination({
      tenantId: 't1',
      employeeId: 'e1',
      terminationDate: '2099-01-01', // far future, stays pending
      revokeAccess: false,
      createdByUserId: 'u1',
    });

    await expect(
      createTermination({ tenantId: 't1', employeeId: 'e1', terminationDate: '2026-01-01', revokeAccess: false, createdByUserId: 'u1' }),
    ).rejects.toThrow(/already has a scheduled termination/);
  });
});

describe('createTermination — scheduled (future)', () => {
  beforeEach(resetMocks);

  it('does not apply anything until the date arrives', async () => {
    const result = await createTermination({
      tenantId: 't1',
      employeeId: 'e1',
      terminationDate: '2099-01-01',
      revokeAccess: false,
      createdByUserId: 'u1',
    });

    expect(result.executedNow).toBe(false);
    expect(result.termination.executedAt).toBeNull();
    expect(employees.find((e) => e.id === 'e1')!.statusId).toBe('status-active');
  });
});

describe('cancelTermination', () => {
  beforeEach(resetMocks);

  it('cancels a pending (not yet executed) termination', async () => {
    const { termination } = await createTermination({
      tenantId: 't1',
      employeeId: 'e1',
      terminationDate: '2099-01-01',
      revokeAccess: false,
      createdByUserId: 'u1',
    });

    const result = await cancelTermination(termination.id, 't1');

    expect(result.success).toBe(true);
    expect(employeeTerminations.find((t) => t.id === termination.id)!.cancelledAt).not.toBeNull();
  });

  it('refuses to cancel a termination that already executed', async () => {
    const { termination } = await createTermination({
      tenantId: 't1',
      employeeId: 'e1',
      terminationDate: '2026-01-01',
      revokeAccess: false,
      createdByUserId: 'u1',
    });

    const result = await cancelTermination(termination.id, 't1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already took effect/);
  });
});

describe('runScheduledTerminations', () => {
  beforeEach(resetMocks);

  it('executes terminations whose date has arrived, leaves future ones untouched', async () => {
    employees = [baseEmployee({ id: 'e1' }), baseEmployee({ id: 'e2' })];
    await createTermination({ tenantId: 't1', employeeId: 'e1', terminationDate: '2020-01-01', revokeAccess: false, createdByUserId: 'u1' });
    // force it back to "not yet executed" to simulate a scheduled one whose date has now arrived
    employeeTerminations[0].executedAt = null;
    employees.find((e) => e.id === 'e1')!.statusId = 'status-active';

    await createTermination({ tenantId: 't1', employeeId: 'e2', terminationDate: '2099-01-01', revokeAccess: false, createdByUserId: 'u1' });

    const result = await runScheduledTerminations();

    expect(result).toEqual({ checked: 1, executed: 1, failed: 0 });
    expect(employees.find((e) => e.id === 'e1')!.statusId).not.toBe('status-active');
    expect(employees.find((e) => e.id === 'e2')!.statusId).toBe('status-active');
  });

  it('one termination failing does not stop the rest from executing', async () => {
    employees = [baseEmployee({ id: 'e1' }), baseEmployee({ id: 'e2' })];
    await createTermination({ tenantId: 't1', employeeId: 'e1', terminationDate: '2020-01-01', revokeAccess: false, createdByUserId: 'u1' });
    await createTermination({ tenantId: 't1', employeeId: 'e2', terminationDate: '2020-01-01', revokeAccess: false, createdByUserId: 'u1' });
    employeeTerminations[0].executedAt = null;
    employeeTerminations[1].executedAt = null;
    employees.forEach((e) => (e.statusId = 'status-active'));
    // Break the first one by removing the employee its termination points at.
    employees = employees.filter((e) => e.id !== 'e1');

    const result = await runScheduledTerminations();

    expect(result).toEqual({ checked: 2, executed: 1, failed: 1 });
    expect(employees.find((e) => e.id === 'e2')!.statusId).not.toBe('status-active');
  });
});

describe('listDirectReports / getLatestTermination', () => {
  beforeEach(resetMocks);

  it('lists only employees who report to the given manager', async () => {
    employees = [baseEmployee({ id: 'e1' }), baseEmployee({ id: 'r1', managerId: 'e1' }), baseEmployee({ id: 'r2', managerId: 'other' })];

    const reports = await listDirectReports('e1');

    expect(reports.map((r) => r.id)).toEqual(['r1']);
  });

  it('returns null when there is no termination at all', async () => {
    expect(await getLatestTermination('e1')).toBeNull();
  });
});
