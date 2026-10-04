import prisma from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../auth/authService.js';
import { canManageShifts, canViewShifts } from '../auth/permissionService.js';
import { findEmployeeByUserId } from '../hr/employeeService.js';

// Shifts module (spec-shifts.md §2) — who can see/schedule what. Two layers, same split as Projects
// and Time Off approval:
//   1. the role permission (view_shifts / manage_shifts) covers EVERY location;
//   2. the relationship rule: a location's manager sees and schedules that location, and everyone
//      sees and answers their own shifts, whatever their role says.
// Every check assumes the caller already confirmed the row's tenantId === user.tenantId.

export async function findOwnEmployeeIdForShifts(user: AuthenticatedUser): Promise<string | null> {
  const employee = await findEmployeeByUserId(user.id);
  return employee && employee.tenantId === user.tenantId ? employee.id : null;
}

// Locations this user manages through Location.managerEmployeeId (not through the role).
export async function managedLocationIds(user: AuthenticatedUser): Promise<string[]> {
  if (!user.tenantId) return [];
  const employeeId = await findOwnEmployeeIdForShifts(user);
  if (!employeeId) return [];
  const rows = await prisma.location.findMany({
    where: { tenantId: user.tenantId, managerEmployeeId: employeeId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function canManageLocationShifts(user: AuthenticatedUser, locationId: string): Promise<boolean> {
  if (canManageShifts(user.roleContext)) return true;
  return (await managedLocationIds(user)).includes(locationId);
}

export async function canViewLocationShifts(user: AuthenticatedUser, locationId: string): Promise<boolean> {
  if (canViewShifts(user.roleContext)) return true;
  return canManageLocationShifts(user, locationId);
}

// The schedule screen's location filter: null = every location (role permission), otherwise the
// ones this user manages (possibly none — they then see only their own shifts on "My shifts").
export async function viewableLocationIds(user: AuthenticatedUser): Promise<string[] | null> {
  if (canViewShifts(user.roleContext) || canManageShifts(user.roleContext)) return null;
  return managedLocationIds(user);
}
