import { beforeEach, describe, expect, it, vi } from 'vitest';

let tenants: any[] = [];
let entries: { id: string; tenantId: string; changedAt: Date }[] = [];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    tenant: {
      findMany: vi.fn(async ({ where }: any) => {
        const excluded: string[] = where.status.notIn;
        return tenants.filter((t) => !excluded.includes(t.status)).map((t) => ({ id: t.id, plan: t.plan }));
      }),
    },
    activityLogEntry: {
      deleteMany: vi.fn(async ({ where }: any) => {
        const before = entries.length;
        entries = entries.filter((e) => !(e.tenantId === where.tenantId && e.changedAt < where.changedAt.lt));
        return { count: before - entries.length };
      }),
    },
  },
}));

import { runActivityLogRetention } from '../src/modules/activity/activityLogRetentionService.js';

const DAY = 24 * 60 * 60 * 1000;

describe('runActivityLogRetention', () => {
  beforeEach(() => {
    tenants = [];
    entries = [];
  });

  it('deletes Starter entries older than 7 days, keeps everything within the window', async () => {
    const now = new Date('2026-09-07T12:00:00Z');
    tenants = [{ id: 't1', plan: 'starter', status: 'active' }];
    entries = [
      { id: 'old', tenantId: 't1', changedAt: new Date(now.getTime() - 8 * DAY) },
      { id: 'recent', tenantId: 't1', changedAt: new Date(now.getTime() - 6 * DAY) },
    ];

    const result = await runActivityLogRetention(now);

    expect(entries.map((e) => e.id)).toEqual(['recent']);
    expect(result).toEqual({ tenantsChecked: 1, entriesDeleted: 1 });
  });

  it('deletes Growth entries older than 30 days, not 7', async () => {
    const now = new Date('2026-09-07T12:00:00Z');
    tenants = [{ id: 't1', plan: 'growth', status: 'active' }];
    entries = [
      { id: 'ten-days-old', tenantId: 't1', changedAt: new Date(now.getTime() - 10 * DAY) },
      { id: 'forty-days-old', tenantId: 't1', changedAt: new Date(now.getTime() - 40 * DAY) },
    ];

    const result = await runActivityLogRetention(now);

    expect(entries.map((e) => e.id)).toEqual(['ten-days-old']);
    expect(result.entriesDeleted).toBe(1);
  });

  it('a tenant on Free Trial (plan null) is treated as Growth — 30 day window, not 7', async () => {
    const now = new Date('2026-09-07T12:00:00Z');
    tenants = [{ id: 't1', plan: null, status: 'trialing' }];
    entries = [{ id: 'ten-days-old', tenantId: 't1', changedAt: new Date(now.getTime() - 10 * DAY) }];

    await runActivityLogRetention(now);

    expect(entries).toHaveLength(1); // survives — would have been deleted under a 7-day window
  });

  it('excludes suspended and cancelled tenants entirely', async () => {
    tenants = [
      { id: 't1', plan: 'starter', status: 'suspended' },
      { id: 't2', plan: 'starter', status: 'cancelled' },
    ];
    const result = await runActivityLogRetention();
    expect(result.tenantsChecked).toBe(0);
  });

  it('never touches another tenant\'s entries', async () => {
    const now = new Date('2026-09-07T12:00:00Z');
    tenants = [
      { id: 't1', plan: 'starter', status: 'active' },
      { id: 't2', plan: 'starter', status: 'active' },
    ];
    entries = [
      { id: 't1-old', tenantId: 't1', changedAt: new Date(now.getTime() - 8 * DAY) },
      { id: 't2-old', tenantId: 't2', changedAt: new Date(now.getTime() - 8 * DAY) },
    ];

    await runActivityLogRetention(now);

    expect(entries).toHaveLength(0);
  });
});
