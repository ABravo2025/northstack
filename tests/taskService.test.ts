import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    task: { findMany: findManyMock },
    employee: { findMany: vi.fn(async () => []) },
    company: { findMany: vi.fn(async () => []) },
    contact: { findMany: vi.fn(async () => []) },
    opportunity: { findMany: vi.fn(async () => []) },
  },
}));

import { listTasksForUser } from '../src/modules/tasks/taskService.js';

const baseTask = {
  entityType: 'company' as const,
  entityId: 'company-1',
  title: 'Some task',
  dueDate: null,
  completedAt: null,
};

describe('listTasksForUser', () => {
  beforeEach(() => {
    findManyMock.mockClear();
  });

  it('queries assignee-or-creator for the given user, scoped to the tenant', async () => {
    findManyMock.mockResolvedValueOnce([]);

    await listTasksForUser('tenant-1', 'user-1');

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          OR: [{ assigneeId: 'user-1' }, { createdById: 'user-1' }],
          completedAt: null,
        }),
      }),
    );
  });

  it('drops the completedAt filter when includeCompleted is set', async () => {
    findManyMock.mockResolvedValueOnce([]);

    await listTasksForUser('tenant-1', 'user-1', { includeCompleted: true });

    const where = findManyMock.mock.calls[0][0].where;
    expect(where.completedAt).toBeUndefined();
  });

  it('labels the relationship as assignee, creator, or both', async () => {
    findManyMock.mockResolvedValueOnce([
      { id: 't-assignee', ...baseTask, assigneeId: 'user-1', createdById: 'user-2' },
      { id: 't-creator', ...baseTask, assigneeId: 'user-2', createdById: 'user-1' },
      { id: 't-both', ...baseTask, assigneeId: 'user-1', createdById: 'user-1' },
    ]);

    const tasks = await listTasksForUser('tenant-1', 'user-1');

    expect(tasks.find((t) => t.id === 't-assignee')?.relationship).toBe('assignee');
    expect(tasks.find((t) => t.id === 't-creator')?.relationship).toBe('creator');
    expect(tasks.find((t) => t.id === 't-both')?.relationship).toBe('both');
  });

  it('labels relationship null if somehow neither assignee nor creator matches', async () => {
    // Unreachable via the real `where` clause (the DB never returns this row), but the mapping
    // itself shouldn't silently mislabel it as "creator" if that guarantee is ever broken.
    findManyMock.mockResolvedValueOnce([{ id: 't-unrelated', ...baseTask, assigneeId: 'user-2', createdById: 'user-3' }]);

    const tasks = await listTasksForUser('tenant-1', 'user-1');

    expect(tasks[0].relationship).toBeNull();
  });
});
