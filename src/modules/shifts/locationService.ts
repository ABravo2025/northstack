import prisma from '../../lib/prisma.js';
import type { Location } from '@prisma/client';
import { recordActivity } from '../activity/activityLogService.js';
import { locationActivityFieldConfig } from '../activity/fieldConfigs/locationFieldConfig.js';
import { isValidTimeZone } from './shiftTime.js';

// Shifts module, Unidad 2 (spec-shifts.md §1) — the places shifts happen at. A location is never
// hard-deleted once it has shifts (their history needs it); it's deactivated instead, which also
// frees the slot on Starter's one-active-location limit.

const MAX_NAME = 120;
const MAX_ADDRESS = 300;

export type LocationWithManager = Location & {
  managerEmployee: { id: string; firstName: string; lastName: string } | null;
  _count: { shifts: number };
};

const INCLUDE = {
  managerEmployee: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { shifts: true } },
} as const;

export async function listLocations(tenantId: string, opts: { includeInactive?: boolean; ids?: string[] | null } = {}): Promise<LocationWithManager[]> {
  return prisma.location.findMany({
    where: {
      tenantId,
      ...(opts.includeInactive ? {} : { isActive: true }),
      ...(opts.ids ? { id: { in: opts.ids } } : {}),
    },
    include: INCLUDE,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
}

export async function findLocationById(id: string): Promise<Location | null> {
  return prisma.location.findUnique({ where: { id } });
}

export async function countActiveLocations(tenantId: string): Promise<number> {
  return prisma.location.count({ where: { tenantId, isActive: true } });
}

export interface LocationInput {
  name?: unknown;
  address?: unknown;
  timezone?: unknown;
  managerEmployeeId?: unknown;
  isActive?: unknown;
}

type Result<T> = { success: true; value: T } | { success: false; error: string; field?: string };

interface ParsedLocation {
  name?: string;
  address?: string | null;
  timezone?: string;
  managerEmployeeId?: string | null;
  isActive?: boolean;
}

// Pure shape validation (tenant ownership of the manager is checked separately, it needs the DB).
export function parseLocationInput(input: LocationInput, mode: 'create' | 'update'): Result<ParsedLocation> {
  const out: ParsedLocation = {};
  if (input.name !== undefined || mode === 'create') {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) return { success: false, error: 'Name is required', field: 'name' };
    if (name.length > MAX_NAME) return { success: false, error: `Name must be ${MAX_NAME} characters or fewer`, field: 'name' };
    out.name = name;
  }
  if (input.address !== undefined) {
    if (input.address !== null && typeof input.address !== 'string') return { success: false, error: 'Invalid address', field: 'address' };
    const address = typeof input.address === 'string' ? input.address.trim() : '';
    if (address.length > MAX_ADDRESS) return { success: false, error: `Address must be ${MAX_ADDRESS} characters or fewer`, field: 'address' };
    out.address = address || null;
  }
  if (input.timezone !== undefined || mode === 'create') {
    if (!isValidTimeZone(input.timezone)) return { success: false, error: 'Pick a valid time zone', field: 'timezone' };
    out.timezone = input.timezone;
  }
  if (input.managerEmployeeId !== undefined) {
    if (input.managerEmployeeId !== null && (typeof input.managerEmployeeId !== 'string' || !input.managerEmployeeId)) {
      return { success: false, error: 'Invalid manager', field: 'managerEmployeeId' };
    }
    out.managerEmployeeId = input.managerEmployeeId as string | null;
  }
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== 'boolean') return { success: false, error: 'isActive must be true or false', field: 'isActive' };
    out.isActive = input.isActive;
  }
  return { success: true, value: out };
}

async function managerBelongsToTenant(tenantId: string, employeeId: string): Promise<boolean> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { tenantId: true } });
  return employee?.tenantId === tenantId;
}

function snapshot(location: Location): Record<string, unknown> {
  return {
    name: location.name,
    address: location.address,
    timezone: location.timezone,
    isActive: location.isActive,
    managerEmployeeId: location.managerEmployeeId,
  };
}

// `maxActive` is the plan's maxActiveLocations (null = unlimited); the route passes it in so this
// service stays free of plan lookups, same split as Projects' hasRoomForOpenProject.
export async function createLocation(
  tenantId: string,
  input: LocationInput,
  changedByUserId: string,
  maxActive: number | null,
): Promise<Result<Location> | { success: false; error: 'plan_limit'; limit: number }> {
  const parsed = parseLocationInput(input, 'create');
  if (!parsed.success) return parsed;
  if (parsed.value.managerEmployeeId && !(await managerBelongsToTenant(tenantId, parsed.value.managerEmployeeId))) {
    return { success: false, error: 'Manager not found', field: 'managerEmployeeId' };
  }
  const active = parsed.value.isActive ?? true;
  if (active && maxActive !== null && (await countActiveLocations(tenantId)) >= maxActive) {
    return { success: false, error: 'plan_limit', limit: maxActive };
  }
  const location = await prisma.location.create({
    data: {
      tenantId,
      name: parsed.value.name!,
      address: parsed.value.address ?? null,
      timezone: parsed.value.timezone!,
      managerEmployeeId: parsed.value.managerEmployeeId ?? null,
      isActive: active,
    },
  });
  await recordActivity({
    tenantId,
    entityType: 'location',
    entityId: location.id,
    entityLabel: location.name,
    action: 'create',
    changedByUserId,
    before: null,
    after: snapshot(location),
    fieldConfig: locationActivityFieldConfig,
  });
  return { success: true, value: location };
}

export async function updateLocation(
  existing: Location,
  input: LocationInput,
  changedByUserId: string,
  maxActive: number | null,
): Promise<Result<Location> | { success: false; error: 'plan_limit'; limit: number }> {
  const parsed = parseLocationInput(input, 'update');
  if (!parsed.success) return parsed;
  if (parsed.value.managerEmployeeId && !(await managerBelongsToTenant(existing.tenantId, parsed.value.managerEmployeeId))) {
    return { success: false, error: 'Manager not found', field: 'managerEmployeeId' };
  }
  const reactivating = parsed.value.isActive === true && !existing.isActive;
  if (reactivating && maxActive !== null && (await countActiveLocations(existing.tenantId)) >= maxActive) {
    return { success: false, error: 'plan_limit', limit: maxActive };
  }
  // Changing the zone would silently move every existing shift's real time (their stored UTC
  // instants were computed in the old zone), so it's only allowed while the location has no shifts.
  if (parsed.value.timezone && parsed.value.timezone !== existing.timezone) {
    const shiftCount = await prisma.shift.count({ where: { locationId: existing.id } });
    if (shiftCount > 0) {
      return { success: false, error: 'The time zone can\'t change once the location has shifts', field: 'timezone' };
    }
  }
  const location = await prisma.location.update({ where: { id: existing.id }, data: parsed.value });
  await recordActivity({
    tenantId: existing.tenantId,
    entityType: 'location',
    entityId: location.id,
    entityLabel: location.name,
    action: 'update',
    changedByUserId,
    before: snapshot(existing),
    after: snapshot(location),
    fieldConfig: locationActivityFieldConfig,
  });
  return { success: true, value: location };
}

// Only a location nobody ever scheduled can be deleted outright; otherwise deactivate it.
export async function deleteLocation(existing: Location, changedByUserId: string): Promise<Result<null>> {
  const shiftCount = await prisma.shift.count({ where: { locationId: existing.id } });
  if (shiftCount > 0) {
    return { success: false, error: 'This location has shifts. Deactivate it instead to keep their history.' };
  }
  await prisma.location.delete({ where: { id: existing.id } });
  await recordActivity({
    tenantId: existing.tenantId,
    entityType: 'location',
    entityId: existing.id,
    entityLabel: existing.name,
    action: 'delete',
    changedByUserId,
    before: snapshot(existing),
    after: null,
    fieldConfig: locationActivityFieldConfig,
  });
  return { success: true, value: null };
}
