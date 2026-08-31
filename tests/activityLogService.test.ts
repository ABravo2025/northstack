import { beforeEach, describe, expect, it, vi } from 'vitest';

let entries: any[] = [];
let idSeq = 0;

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    activityLogEntry: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `activity-${++idSeq}`, changedAt: new Date(), ...data };
        entries.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ where, orderBy, take, cursor, skip }: any) => {
        // Matches a single flat condition object (entityType/entityId/parentEntityType/
        // parentEntityId) — used both for the top-level where and each branch of an OR.
        const matchesFlat = (e: any, cond: any) => {
          if (cond.entityType !== undefined && e.entityType !== cond.entityType) return false;
          if (cond.entityId !== undefined && e.entityId !== cond.entityId) return false;
          if (cond.parentEntityType !== undefined && e.parentEntityType !== cond.parentEntityType) return false;
          if (cond.parentEntityId !== undefined && e.parentEntityId !== cond.parentEntityId) return false;
          return true;
        };
        let rows = entries.filter((e) => {
          if (where.tenantId && e.tenantId !== where.tenantId) return false;
          if (where.changedByUserId && e.changedByUserId !== where.changedByUserId) return false;
          if (where.action && e.action !== where.action) return false;
          if (where.changedAt?.gte && e.changedAt < where.changedAt.gte) return false;
          if (where.changedAt?.lte && e.changedAt > where.changedAt.lte) return false;
          if (where.OR) {
            if (!where.OR.some((cond: any) => matchesFlat(e, cond))) return false;
          } else if (!matchesFlat(e, where)) {
            return false;
          }
          return true;
        });
        // orderBy: [{changedAt: 'desc'}, {id: 'desc'}] — stable sort newest first
        rows = [...rows].sort((a, b) => {
          const t = b.changedAt.getTime() - a.changedAt.getTime();
          return t !== 0 ? t : b.id.localeCompare(a.id);
        });
        if (cursor) {
          const idx = rows.findIndex((r) => r.id === cursor.id);
          rows = idx >= 0 ? rows.slice(idx + (skip ?? 0)) : [];
        }
        if (take !== undefined) rows = rows.slice(0, take);
        return rows.map((r) => ({ ...r, changedBy: { id: r.changedByUserId, firstName: 'Jane', lastName: 'Smith' } }));
      }),
    },
  },
}));

import { diffEntity, listActivityFeed, listActivityForEntity, recordActivity, summarizeChanges } from '../src/modules/activity/activityLogService.js';
import prisma from '../src/lib/prisma.js';

beforeEach(() => {
  entries = [];
  idSeq = 0;
  vi.clearAllMocks();
});

describe('diffEntity', () => {
  const fieldConfig = {
    name: { label: 'Name' },
    amountCents: { label: 'Amount', resolve: (v: unknown) => (v == null ? null : `$${(v as number) / 100}`) },
  };

  it('returns no changes when nothing differs', async () => {
    const changes = await diffEntity({ name: 'Acme' }, { name: 'Acme' }, fieldConfig);
    expect(changes).toEqual([]);
  });

  it('detects a plain field change with default formatting', async () => {
    const changes = await diffEntity({ name: 'Acme' }, { name: 'Acme Inc' }, fieldConfig);
    expect(changes).toEqual([{ field: 'name', label: 'Name', oldValue: 'Acme', newValue: 'Acme Inc' }]);
  });

  it('resolves values through a per-field resolver', async () => {
    const changes = await diffEntity({ amountCents: 1000 }, { amountCents: 2000 }, fieldConfig);
    expect(changes).toEqual([{ field: 'amountCents', label: 'Amount', oldValue: '$10', newValue: '$20' }]);
  });

  it('treats null before as create-style "set"', async () => {
    const changes = await diffEntity(null, { name: 'Acme' }, fieldConfig);
    expect(changes).toEqual([{ field: 'name', label: 'Name', oldValue: null, newValue: 'Acme' }]);
  });

  it('treats null after as delete-style "cleared"', async () => {
    const changes = await diffEntity({ name: 'Acme' }, null, fieldConfig);
    expect(changes).toEqual([{ field: 'name', label: 'Name', oldValue: 'Acme', newValue: null }]);
  });

  it('compares Date fields by timestamp, not reference', async () => {
    const dateConfig = { dueDate: { label: 'Due date' } };
    const sameInstant = '2026-01-01T00:00:00.000Z';
    const noChange = await diffEntity({ dueDate: new Date(sameInstant) }, { dueDate: new Date(sameInstant) }, dateConfig);
    expect(noChange).toEqual([]);

    const changed = await diffEntity(
      { dueDate: new Date('2026-01-01T00:00:00.000Z') },
      { dueDate: new Date('2026-01-02T00:00:00.000Z') },
      dateConfig,
    );
    expect(changed).toEqual([{ field: 'dueDate', label: 'Due date', oldValue: '2026-01-01', newValue: '2026-01-02' }]);
  });

  it('skips a field whose resolved display value is unchanged despite differing raw ids', async () => {
    const resolveConfig = { statusId: { label: 'Status', resolve: () => 'Active' } };
    const changes = await diffEntity({ statusId: 's1' }, { statusId: 's2' }, resolveConfig);
    expect(changes).toEqual([]);
  });
});

describe('summarizeChanges', () => {
  it('summarizes create/delete without listing every field', () => {
    expect(summarizeChanges([], 'create', 'opportunity', 'Acme Renewal')).toBe('Created Opportunity "Acme Renewal"');
    expect(summarizeChanges([], 'delete', 'company', 'Acme Inc')).toBe('Deleted Company "Acme Inc"');
  });

  it('describes a single change as Changed X: A → B', () => {
    const summary = summarizeChanges(
      [{ field: 'stageId', label: 'Stage', oldValue: 'Discovery', newValue: 'Proposal' }],
      'update',
      'opportunity',
      'Acme Renewal',
    );
    expect(summary).toBe('Changed Stage: Discovery → Proposal');
  });

  it('describes a set (null → value) and a cleared (value → null) distinctly', () => {
    expect(
      summarizeChanges([{ field: 'x', label: 'Next step note', oldValue: null, newValue: 'Call back' }], 'update', 'opportunity', 'Deal'),
    ).toBe('Set Next step note: Call back');
    expect(
      summarizeChanges([{ field: 'x', label: 'Next step note', oldValue: 'Call back', newValue: null }], 'update', 'opportunity', 'Deal'),
    ).toBe('Cleared Next step note (was Call back)');
  });

  it('collapses 3+ changes into "and N more"', () => {
    const changes = [
      { field: 'a', label: 'A', oldValue: '1', newValue: '2' },
      { field: 'b', label: 'B', oldValue: '1', newValue: '2' },
      { field: 'c', label: 'C', oldValue: '1', newValue: '2' },
    ];
    expect(summarizeChanges(changes, 'update', 'opportunity', 'Deal')).toBe('Changed A, B and 1 more');
  });
});

describe('recordActivity', () => {
  const fieldConfig = { name: { label: 'Name' } };

  it('writes an entry with the auto-generated summary and JSON changes', async () => {
    await recordActivity({
      tenantId: 't1',
      entityType: 'opportunity',
      entityId: 'o1',
      entityLabel: 'Acme Renewal',
      action: 'update',
      changedByUserId: 'u1',
      before: { name: 'Old name' },
      after: { name: 'New name' },
      fieldConfig,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].summary).toBe('Changed Name: Old name → New name');
    expect(JSON.parse(entries[0].changes)).toEqual([{ field: 'name', label: 'Name', oldValue: 'Old name', newValue: 'New name' }]);
  });

  it('does not write anything for an update with no actual field changes', async () => {
    await recordActivity({
      tenantId: 't1',
      entityType: 'opportunity',
      entityId: 'o1',
      entityLabel: 'Acme Renewal',
      action: 'update',
      changedByUserId: 'u1',
      before: { name: 'Same' },
      after: { name: 'Same' },
      fieldConfig,
    });

    expect(entries).toHaveLength(0);
  });

  it('is best-effort: a failing write is swallowed, never thrown to the caller', async () => {
    vi.mocked(prisma.activityLogEntry.create).mockRejectedValueOnce(new Error('db down'));

    await expect(
      recordActivity({
        tenantId: 't1',
        entityType: 'opportunity',
        entityId: 'o1',
        entityLabel: 'Acme Renewal',
        action: 'create',
        changedByUserId: 'u1',
        after: { name: 'New' },
        fieldConfig,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('listActivityForEntity / listActivityFeed', () => {
  const fieldConfig = { name: { label: 'Name' } };

  async function seed() {
    await recordActivity({
      tenantId: 't1',
      entityType: 'opportunity',
      entityId: 'o1',
      entityLabel: 'Deal A',
      action: 'create',
      changedByUserId: 'u1',
      after: { name: 'Deal A' },
      fieldConfig,
    });
    await recordActivity({
      tenantId: 't1',
      entityType: 'company',
      entityId: 'c1',
      entityLabel: 'Acme Inc',
      action: 'create',
      changedByUserId: 'u2',
      after: { name: 'Acme Inc' },
      fieldConfig,
    });
    await recordActivity({
      tenantId: 't2',
      entityType: 'opportunity',
      entityId: 'o1',
      entityLabel: 'Other tenant deal',
      action: 'create',
      changedByUserId: 'u3',
      after: { name: 'Other tenant deal' },
      fieldConfig,
    });
  }

  it('scopes the per-record feed to tenant + entityType + entityId', async () => {
    await seed();
    const result = await listActivityForEntity('t1', 'opportunity' as any, 'o1');
    expect(result).toHaveLength(1);
    expect(result[0].entityLabel).toBe('Deal A');
  });

  it('also surfaces a child Note/Task/Tag attached to this record via parentEntityType/parentEntityId', async () => {
    await seed();
    await recordActivity({
      tenantId: 't1',
      entityType: 'note',
      entityId: 'note1',
      entityLabel: 'A note',
      action: 'create',
      changedByUserId: 'u1',
      after: { name: 'A note' },
      fieldConfig,
      parentEntityType: 'opportunity' as any,
      parentEntityId: 'o1',
    });

    const result = await listActivityForEntity('t1', 'opportunity' as any, 'o1');
    expect(result).toHaveLength(2);
    expect(result.some((r) => r.entityType === 'note' && r.entityLabel === 'A note')).toBe(true);
    expect(result.some((r) => r.entityType === 'opportunity' && r.entityLabel === 'Deal A')).toBe(true);

    // A note attached to a *different* record never leaks in.
    const unrelated = await listActivityForEntity('t1', 'company' as any, 'c1');
    expect(unrelated.some((r) => r.entityLabel === 'A note')).toBe(false);
  });

  it('scopes the tenant-wide feed to tenantId and never leaks another tenant', async () => {
    await seed();
    const page = await listActivityFeed({ tenantId: 't1' });
    expect(page.items).toHaveLength(2);
    expect(page.items.every((i) => i.tenantId === 't1')).toBe(true);
  });

  it('paginates by cursor and reports nextCursor only when more rows remain', async () => {
    await seed();
    const firstPage = await listActivityFeed({ tenantId: 't1', limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await listActivityFeed({ tenantId: 't1', limit: 1, cursor: firstPage.nextCursor! });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
    expect(secondPage.items[0].id).not.toBe(firstPage.items[0].id);
  });

  it('filters the tenant-wide feed by entityType', async () => {
    await seed();
    const page = await listActivityFeed({ tenantId: 't1', entityType: 'company' as any });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].entityLabel).toBe('Acme Inc');
  });
});
