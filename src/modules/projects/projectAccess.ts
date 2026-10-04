import prisma from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../auth/authService.js';
import { canManageProjects, canViewProjects } from '../auth/permissionService.js';

// Projects module (2026-10-04) — who can see/edit a single project. Two layers, same split as Time
// Off approval (canDecideTimeOff OR "is the assigned manager"):
//   1. the role permission (view_projects / manage_projects) covers EVERY project in the tenant;
//   2. the relationship rule: the project's owner and its members always see it, and the owner can
//      edit it, whatever their role says — so a plain Member works on their own projects without
//      being handed company-wide visibility.
// Both checks assume the caller already confirmed project.tenantId === user.tenantId.

// The Employee row linked to this login, if any. A user with no Employee (rare — e.g. an owner who
// never got one) only ever reaches projects through the role permission.
export async function findOwnEmployeeId(user: AuthenticatedUser): Promise<string | null> {
  if (!user.tenantId) return null;
  const employee = await prisma.employee.findFirst({
    where: { tenantId: user.tenantId, userId: user.id },
    select: { id: true },
  });
  return employee?.id ?? null;
}

export async function canViewProject(user: AuthenticatedUser, projectId: string): Promise<boolean> {
  if (canViewProjects(user.roleContext)) return true;
  const employeeId = await findOwnEmployeeId(user);
  if (!employeeId) return false;
  const match = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [{ ownerEmployeeId: employeeId }, { members: { some: { employeeId } } }],
    },
    select: { id: true },
  });
  return match !== null;
}

// Editing details, phases and team. Members (not owners) can still work the project's tasks — those
// go through the ordinary Task routes, which have never been permission-gated beyond the tenant.
export async function canEditProject(user: AuthenticatedUser, projectId: string): Promise<boolean> {
  if (canManageProjects(user.roleContext)) return true;
  const employeeId = await findOwnEmployeeId(user);
  if (!employeeId) return false;
  const match = await prisma.project.findFirst({
    where: { id: projectId, ownerEmployeeId: employeeId },
    select: { id: true },
  });
  return match !== null;
}
