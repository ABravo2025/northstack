import { beforeEach, describe, expect, it, vi } from 'vitest';

const { projectFindMany, projectCount, taskFindMany } = vi.hoisted(() => ({
  projectFindMany: vi.fn(),
  projectCount: vi.fn(),
  taskFindMany: vi.fn(),
}));

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    project: { findMany: projectFindMany, count: projectCount },
    task: { findMany: taskFindMany },
  },
}));

import {
  createProjectRecords,
  hasRoomForOpenProject,
  listProjects,
  parseProjectDate,
  wouldBeOpen,
  type PrismaTx,
} from '../src/modules/projects/projectService.js';

beforeEach(() => {
  projectFindMany.mockReset();
  projectCount.mockReset();
  taskFindMany.mockReset();
});

describe('parseProjectDate', () => {
  it('keeps only the calendar date, at UTC midnight', () => {
    expect((parseProjectDate('2026-11-01') as Date).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect((parseProjectDate('2026-11-01T18:30:00-03:00') as Date).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('treats undefined as "leave alone" and null/empty as "clear"', () => {
    expect(parseProjectDate(undefined)).toBeUndefined();
    expect(parseProjectDate(null)).toBeNull();
    expect(parseProjectDate('')).toBeNull();
  });

  it('rejects anything that is not a date', () => {
    expect(parseProjectDate('tomorrow')).toBe('invalid');
    expect(parseProjectDate(20261101)).toBe('invalid');
    expect(parseProjectDate('2026-13-45')).toBe('invalid');
  });
});

describe('listProjects', () => {
  const phases = [
    { id: 'ph-2', name: 'Conciliación', color: null, order: 1 },
    { id: 'ph-1', name: 'Recolección', color: null, order: 0 },
  ];

  it('computes progress, the current phase and the next due date from the tasks', async () => {
    projectFindMany.mockResolvedValueOnce([{ id: 'p1', phases }]);
    taskFindMany.mockResolvedValueOnce([
      { entityId: 'p1', completedAt: new Date(), dueDate: new Date('2020-01-01'), projectPhaseId: 'ph-1' },
      { entityId: 'p1', completedAt: null, dueDate: new Date('2099-03-01'), projectPhaseId: 'ph-2' },
      { entityId: 'p1', completedAt: null, dueDate: new Date('2020-02-01'), projectPhaseId: 'ph-2' },
      { entityId: 'p1', completedAt: null, dueDate: null, projectPhaseId: null },
    ]);

    const [project] = await listProjects('tenant-1');

    expect(project.progress).toEqual({
      taskCount: 4,
      doneCount: 1,
      overdueCount: 1,
      nextDueDate: new Date('2020-02-01'),
      currentPhaseId: 'ph-2', // ph-1 (order 0) has no open task left
    });
  });

  it('reports an empty project as 0 of 0 with no current phase', async () => {
    projectFindMany.mockResolvedValueOnce([{ id: 'p1', phases }]);
    taskFindMany.mockResolvedValueOnce([]);

    const [project] = await listProjects('tenant-1');

    expect(project.progress).toMatchObject({ taskCount: 0, doneCount: 0, nextDueDate: null, currentPhaseId: null });
  });

  it('returns nothing, without querying, for a caller who can see no project', async () => {
    expect(await listProjects('tenant-1', { visibleToEmployeeId: null })).toEqual([]);
    expect(projectFindMany).not.toHaveBeenCalled();
  });

  it('limits a caller without view_projects to projects they own or belong to', async () => {
    projectFindMany.mockResolvedValueOnce([]);

    await listProjects('tenant-1', { visibleToEmployeeId: 'emp-1' });

    const where = projectFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: 'tenant-1', isActive: true });
    expect(where.AND).toEqual([{ OR: [{ ownerEmployeeId: 'emp-1' }, { members: { some: { employeeId: 'emp-1' } } }] }]);
  });
});

describe('open-project limit', () => {
  it('only planning/active/on hold projects that are not archived count as open', () => {
    expect(wouldBeOpen('active', true)).toBe(true);
    expect(wouldBeOpen('on_hold', true)).toBe(true);
    expect(wouldBeOpen('completed', true)).toBe(false);
    expect(wouldBeOpen('active', false)).toBe(false);
  });

  it('blocks Starter at 5 open projects', async () => {
    projectCount.mockResolvedValueOnce(5);
    expect(await hasRoomForOpenProject({ plan: 'starter' }, 'tenant-1')).toEqual({ allowed: false, max: 5 });
    projectCount.mockResolvedValueOnce(4);
    expect(await hasRoomForOpenProject({ plan: 'starter' }, 'tenant-1')).toEqual({ allowed: true, max: 5 });
  });

  it('never counts for Growth or the Free Trial', async () => {
    expect(await hasRoomForOpenProject({ plan: 'growth' }, 'tenant-1')).toEqual({ allowed: true, max: null });
    expect(await hasRoomForOpenProject({ plan: null }, 'tenant-1')).toEqual({ allowed: true, max: null });
    expect(projectCount).not.toHaveBeenCalled();
  });
});

describe('createProjectRecords', () => {
  function fakeTx() {
    return {
      project: { create: vi.fn(async ({ data }) => ({ id: 'p1', ...data })) },
      projectPhase: { create: vi.fn(async ({ data }) => ({ id: `ph-${data.order}`, ...data })) },
      projectMember: { createMany: vi.fn(async () => ({ count: 0 })) },
    };
  }

  it('always puts the owner on the team and drops duplicate members', async () => {
    const tx = fakeTx();
    await createProjectRecords(
      tx as unknown as PrismaTx,
      {
        tenantId: 't1',
        name: '  Cierre mensual  ',
        ownerEmployeeId: 'owner',
        members: [
          { employeeId: 'ana', projectRole: '  Contador ' },
          { employeeId: 'ana', projectRole: 'Asistente' },
          { employeeId: 'luis', projectRole: '' },
        ],
      },
      'user-1',
    );

    expect(tx.project.create.mock.calls[0][0].data).toMatchObject({ name: 'Cierre mensual', status: 'active', completedAt: null });
    expect(tx.projectMember.createMany.mock.calls[0][0].data).toEqual([
      { tenantId: 't1', projectId: 'p1', employeeId: 'owner', projectRole: null },
      { tenantId: 't1', projectId: 'p1', employeeId: 'ana', projectRole: 'Contador' },
      { tenantId: 't1', projectId: 'p1', employeeId: 'luis', projectRole: null },
    ]);
  });

  it('creates phases in order, with a default color each', async () => {
    const tx = fakeTx();
    const { phases } = await createProjectRecords(
      tx as unknown as PrismaTx,
      { tenantId: 't1', name: 'Web', ownerEmployeeId: 'owner', phases: [{ name: 'Diseño' }, { name: 'Desarrollo', color: '#000000' }] },
      'user-1',
    );

    expect(phases.map((p) => [p.name, p.order, p.color])).toEqual([
      ['Diseño', 0, '#7c5cff'],
      ['Desarrollo', 1, '#000000'],
    ]);
  });

  it('stamps completedAt when a project is created already completed', async () => {
    const tx = fakeTx();
    await createProjectRecords(tx as unknown as PrismaTx, { tenantId: 't1', name: 'Old', ownerEmployeeId: 'o', status: 'completed' }, 'u');
    expect(tx.project.create.mock.calls[0][0].data.completedAt).toBeInstanceOf(Date);
  });
});
