import { describe, expect, it, vi } from 'vitest';

interface FakeEntry {
  id: string;
  tenantId: string;
  employeeId: string;
  runId: string | null;
  type: string;
  amountCents: number;
  currency: string;
  label: string | null;
  paymentDate: Date;
}

const entries: FakeEntry[] = [
  {
    id: 'e1',
    tenantId: 't1',
    employeeId: 'emp1',
    runId: null,
    type: 'base',
    amountCents: 100000,
    currency: 'USD',
    label: 'Final payment',
    paymentDate: new Date('2026-08-28'),
  },
  {
    id: 'e2',
    tenantId: 't1',
    employeeId: 'emp1',
    runId: 'run-confirmed',
    type: 'bonus',
    amountCents: 5000,
    currency: 'USD',
    label: null,
    paymentDate: new Date('2026-08-01'),
  },
  {
    id: 'e3',
    tenantId: 't1',
    employeeId: 'emp1',
    runId: 'run-draft',
    type: 'base',
    amountCents: 200000,
    currency: 'USD',
    label: null,
    paymentDate: new Date('2026-09-01'),
  },
];

const employees: Record<string, { firstName: string; lastName: string }> = {
  emp1: { firstName: 'Jane', lastName: 'Doe' },
};

const runs: Record<string, { id: string; status: string; periodLabel: string }> = {
  'run-confirmed': { id: 'run-confirmed', status: 'confirmed', periodLabel: 'Aug 2026' },
  'run-draft': { id: 'run-draft', status: 'draft', periodLabel: 'Sep 2026' },
};

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    payrollEntry: {
      findMany: vi.fn(async ({ where, include }: any) => {
        let matches = entries.filter((e) => e.tenantId === where.tenantId);
        if (where.employeeId) matches = matches.filter((e) => e.employeeId === where.employeeId);
        if (where.runId === null) matches = matches.filter((e) => e.runId === null);
        if (where.OR) {
          matches = matches.filter((e) =>
            where.OR.some((cond: any) =>
              cond.runId === null ? e.runId === null : e.runId !== null && runs[e.runId]?.status === cond.run.status,
            ),
          );
        }
        return matches.map((e) => ({
          ...e,
          employee: include?.employee ? employees[e.employeeId] : undefined,
          run: include?.run && e.runId ? { periodLabel: runs[e.runId].periodLabel } : e.runId ? runs[e.runId] : null,
        }));
      }),
    },
  },
}));

const { listOffPayments } = await import('../src/modules/hr/payrollOffPaymentService.js');
const { listPaymentHistoryForEmployee } = await import('../src/modules/hr/payrollEntryService.js');

describe('listOffPayments', () => {
  it('flattens employee.firstName/lastName into employeeFirstName/employeeLastName', async () => {
    const result = await listOffPayments('t1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ employeeFirstName: 'Jane', employeeLastName: 'Doe' });
    expect((result[0] as any).employee).toBeUndefined();
  });
});

describe('listPaymentHistoryForEmployee', () => {
  it('includes off-cycle entries and confirmed run entries, excludes draft run entries', async () => {
    const result = await listPaymentHistoryForEmployee('t1', 'emp1');
    expect(result.map((r) => r.id).sort()).toEqual(['e1', 'e2']);
  });

  it('tags source correctly and carries periodLabel for run entries', async () => {
    const result = await listPaymentHistoryForEmployee('t1', 'emp1');
    const offCycle = result.find((r) => r.id === 'e1')!;
    const runEntry = result.find((r) => r.id === 'e2')!;
    expect(offCycle.source).toBe('off-cycle');
    expect(offCycle.periodLabel).toBeNull();
    expect(runEntry.source).toBe('run');
    expect(runEntry.periodLabel).toBe('Aug 2026');
  });
});
