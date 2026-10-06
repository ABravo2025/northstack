import { describe, expect, it } from 'vitest';
import { planTenantPurge, type ForeignKey } from '../src/modules/platform/tenantPurgeService.js';

// A tiny fake database: tables -> rows with their FK columns.
const db: Record<string, { id?: string; [k: string]: string | undefined }[]> = {
  Tenant: [{ id: 't1' }, { id: 't2' }],
  User: [{ id: 'u1', tenantId: 't1' }, { id: 'u2', tenantId: 't2' }],
  Employee: [{ id: 'e1', tenantId: 't1', userId: 'u1' }, { id: 'e2', tenantId: 't2' }],
  Session: [{ id: 's1', userId: 'u1' }, { id: 's2', userId: 'u2' }],
  Subscription: [{ id: 'sub1', tenantId: 't1' }],
  Invoice: [{ id: 'i1', subscriptionId: 'sub1' }],
  PlatformAuditEntry: [{ id: 'a1', tenantId: 't1', actorUserId: 'staff' }],
  UserActivityDay: [{ userId: 'u1' }, { userId: 'u2' }], // composite key, no "id"
};
const fks: ForeignKey[] = [
  { child: 'User', column: 'tenantId', parent: 'Tenant', deleteRule: 'SET NULL' },
  { child: 'Employee', column: 'tenantId', parent: 'Tenant', deleteRule: 'RESTRICT' },
  { child: 'Employee', column: 'userId', parent: 'User', deleteRule: 'SET NULL' },
  { child: 'Session', column: 'userId', parent: 'User', deleteRule: 'RESTRICT' },
  { child: 'Subscription', column: 'tenantId', parent: 'Tenant', deleteRule: 'RESTRICT' },
  { child: 'Invoice', column: 'subscriptionId', parent: 'Subscription', deleteRule: 'SET NULL' },
  { child: 'PlatformAuditEntry', column: 'tenantId', parent: 'Tenant', deleteRule: 'SET NULL' },
  { child: 'UserActivityDay', column: 'userId', parent: 'User', deleteRule: 'CASCADE' },
];
const lookup = async (table: string, column: string, ids: string[]) => {
  const rows = db[table] ?? [];
  if (!rows.every((r) => r.id)) return null;
  return rows.filter((r) => ids.includes(r[column] ?? '')).map((r) => r.id!);
};

describe('planTenantPurge', () => {
  it('collects every row of the tenant, through users and subscriptions, and nothing of other tenants', async () => {
    const { rows, steps } = await planTenantPurge('t1', fks, lookup);
    const got = Object.fromEntries([...rows.entries()].map(([t, s]) => [t, [...s].sort()]));
    expect(got).toEqual({ Tenant: ['t1'], User: ['u1'], Employee: ['e1'], Session: ['s1'], Subscription: ['sub1'] });
    expect(steps).toEqual([{ table: 'UserActivityDay', column: 'userId', ids: ['u1'] }]);
  });
  it('keeps rows linked with SET NULL (e.g. the platform audit log and invoices — fiscal records, kept on purpose)', async () => {
    const { rows } = await planTenantPurge('t1', fks, lookup);
    expect(rows.has('PlatformAuditEntry')).toBe(false);
    expect(rows.has('Invoice')).toBe(false);
  });
});
