import { beforeEach, describe, expect, it, vi } from 'vitest';

const { employeeFindFirst, projectFindFirst } = vi.hoisted(() => ({
  employeeFindFirst: vi.fn(),
  projectFindFirst: vi.fn(),
}));

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    employee: { findFirst: employeeFindFirst },
    project: { findFirst: projectFindFirst },
  },
}));

import { canEditProject, canViewProject } from '../src/modules/projects/projectAccess.js';
import type { AuthenticatedUser } from '../src/modules/auth/authService.js';

function userWith(permissions: string[], isOwner = false): AuthenticatedUser {
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    roleContext: { id: 'r', name: 'Member', isOwner, permissions: new Set(permissions), hiddenFieldsByEntity: new Map() },
  } as unknown as AuthenticatedUser;
}

beforeEach(() => {
  employeeFindFirst.mockReset();
  projectFindFirst.mockReset();
});

describe('canViewProject', () => {
  it('lets view_projects (and the owner role) see any project without a lookup', async () => {
    expect(await canViewProject(userWith(['view_projects']), 'p1')).toBe(true);
    expect(await canViewProject(userWith([], true), 'p1')).toBe(true);
    expect(employeeFindFirst).not.toHaveBeenCalled();
  });

  it('lets a member see a project they own or belong to', async () => {
    employeeFindFirst.mockResolvedValueOnce({ id: 'emp-1' });
    projectFindFirst.mockResolvedValueOnce({ id: 'p1' });

    expect(await canViewProject(userWith([]), 'p1')).toBe(true);
    expect(projectFindFirst.mock.calls[0][0].where).toEqual({
      id: 'p1',
      OR: [{ ownerEmployeeId: 'emp-1' }, { members: { some: { employeeId: 'emp-1' } } }],
    });
  });

  it('hides projects the person has nothing to do with', async () => {
    employeeFindFirst.mockResolvedValueOnce({ id: 'emp-1' });
    projectFindFirst.mockResolvedValueOnce(null);
    expect(await canViewProject(userWith([]), 'p1')).toBe(false);
  });

  it('hides everything from a login with no Employee record and no permission', async () => {
    employeeFindFirst.mockResolvedValueOnce(null);
    expect(await canViewProject(userWith([]), 'p1')).toBe(false);
    expect(projectFindFirst).not.toHaveBeenCalled();
  });
});

describe('canEditProject', () => {
  it('lets manage_projects edit any project', async () => {
    expect(await canEditProject(userWith(['view_projects', 'manage_projects']), 'p1')).toBe(true);
  });

  it("lets the project's owner edit it, but a plain member only works its tasks", async () => {
    employeeFindFirst.mockResolvedValue({ id: 'emp-1' });
    projectFindFirst.mockResolvedValueOnce({ id: 'p1' });
    expect(await canEditProject(userWith(['view_projects']), 'p1')).toBe(true);
    expect(projectFindFirst.mock.calls[0][0].where).toEqual({ id: 'p1', ownerEmployeeId: 'emp-1' });

    projectFindFirst.mockResolvedValueOnce(null);
    expect(await canEditProject(userWith(['view_projects']), 'p1')).toBe(false);
  });
});
