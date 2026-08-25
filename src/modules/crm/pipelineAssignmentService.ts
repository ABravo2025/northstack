import prisma from '../../lib/prisma.js';
import { getDefaultStatusId } from '../hr/statusService.js';
import { findFieldCatalogDefinitionById } from '../hr/fieldCatalogService.js';
import type { PipelineAssignmentUser } from '@prisma/client';

// Round-robin participants for a Pipeline (docs/tareas/specredisenosalesv2.md
// §3.8) — CRUD mirrors employeeTimeOffPolicyService.ts's shapes exactly (same
// simple join-table pattern), plus the rotation resolver itself.

export async function listPipelineAssignmentUsers(tenantId: string, pipelineId: string) {
  return prisma.pipelineAssignmentUser.findMany({
    where: { tenantId, pipelineId },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true, status: true } } },
    orderBy: { assignedAt: 'asc' },
  });
}

export interface AssignPipelineUserResult {
  success: boolean;
  assignment?: PipelineAssignmentUser;
  error?: string;
}

export async function assignUserToPipeline(
  tenantId: string,
  pipelineId: string,
  userId: string,
): Promise<AssignPipelineUserResult> {
  const pipeline = await prisma.pipeline.findUnique({ where: { id: pipelineId } });
  if (!pipeline || pipeline.tenantId !== tenantId) {
    return { success: false, error: 'Pipeline not found' };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.tenantId !== tenantId) {
    return { success: false, error: 'User not found' };
  }

  const existing = await prisma.pipelineAssignmentUser.findUnique({
    where: { pipelineId_userId: { pipelineId, userId } },
  });
  if (existing) {
    return { success: false, error: 'This user is already a participant' };
  }

  const assignment = await prisma.pipelineAssignmentUser.create({
    data: { tenantId, pipelineId, userId },
  });
  return { success: true, assignment };
}

export interface UnassignPipelineUserResult {
  success: boolean;
  error?: string;
}

export async function unassignUserFromPipeline(
  tenantId: string,
  pipelineId: string,
  userId: string,
): Promise<UnassignPipelineUserResult> {
  const existing = await prisma.pipelineAssignmentUser.findUnique({
    where: { pipelineId_userId: { pipelineId, userId } },
  });
  if (!existing || existing.tenantId !== tenantId) {
    return { success: false, error: 'Assignment not found' };
  }

  await prisma.pipelineAssignmentUser.delete({ where: { id: existing.id } });
  return { success: true };
}

export interface AssignUsersByDepartmentsResult {
  success: boolean;
  error?: string;
  resolvedUserCount: number;
  addedCount: number;
  alreadyAssignedCount: number;
}

// One-time bulk-add convenience, NOT a live binding (confirmed with the user
// 2026-08-25) — resolves who currently has an Employee in the given
// departments and snapshots them into PipelineAssignmentUser as ordinary
// rows. A hire added to the department later is NOT automatically added;
// re-run this (or add them by hand) to pick up new people. There is no
// department↔Pipeline schema anywhere — this only ever writes User rows.
export async function assignUsersByDepartments(
  tenantId: string,
  pipelineId: string,
  departmentIds: string[],
): Promise<AssignUsersByDepartmentsResult> {
  const empty = { resolvedUserCount: 0, addedCount: 0, alreadyAssignedCount: 0 };

  const pipeline = await prisma.pipeline.findUnique({ where: { id: pipelineId } });
  if (!pipeline || pipeline.tenantId !== tenantId) {
    return { success: false, error: 'Pipeline not found', ...empty };
  }

  for (const departmentId of departmentIds) {
    const dept = await findFieldCatalogDefinitionById(departmentId);
    if (!dept || dept.tenantId !== tenantId || dept.kind !== 'department') {
      return { success: false, error: 'Department not found', ...empty };
    }
  }

  const employees = await prisma.employee.findMany({
    where: { tenantId, departmentId: { in: departmentIds }, userId: { not: null } },
    select: { userId: true },
  });
  const resolvedUserIds = [...new Set(employees.map((e) => e.userId as string))];

  const existing = await prisma.pipelineAssignmentUser.findMany({
    where: { tenantId, pipelineId, userId: { in: resolvedUserIds } },
    select: { userId: true },
  });
  const existingIds = new Set(existing.map((e) => e.userId));
  const newUserIds = resolvedUserIds.filter((id) => !existingIds.has(id));

  if (newUserIds.length > 0) {
    await prisma.pipelineAssignmentUser.createMany({
      data: newUserIds.map((userId) => ({ tenantId, pipelineId, userId })),
      skipDuplicates: true,
    });
  }

  return {
    success: true,
    resolvedUserCount: resolvedUserIds.length,
    addedCount: newUserIds.length,
    alreadyAssignedCount: resolvedUserIds.length - newUserIds.length,
  };
}

// Rotation resolver — deliberately mode-agnostic (doesn't check
// Pipeline.assignmentMode itself). Callers gate on mode; this just answers
// "who's next among this Pipeline's participants" so the account_owner
// fallback (docs/tareas/specredisenosalesv2.md §3.8) can call it against a
// Pipeline whose assignmentMode is 'account_owner', not 'round_robin'.
// Returns null when there's nobody to assign — the confirmed behavior is to
// leave the Opportunity ownerless rather than fail the create.
export async function resolveNextRoundRobinUserId(tenantId: string, pipelineId: string): Promise<string | null> {
  // userId tie-break matters: assignUsersByDepartments uses createMany, so a
  // whole batch shares one assignedAt timestamp — without a secondary sort,
  // rotation order would be non-deterministic across runs for those rows.
  const participants = await prisma.pipelineAssignmentUser.findMany({
    where: { tenantId, pipelineId },
    orderBy: [{ assignedAt: 'asc' }, { userId: 'asc' }],
    select: { userId: true },
  });
  if (participants.length === 0) {
    return null;
  }
  const orderedIds = participants.map((p) => p.userId);

  // Eligibility: a linked Employee (has a userId), that Employee currently in
  // the tenant's default 'employee' status, and the User itself active.
  // Never compare status *names* — isDefault is the only tenant-safe signal
  // (a tenant can rename "Active" to anything). Users with no Employee at all
  // are permanently ineligible — surfaced in the picker's UI copy, not
  // special-cased here.
  let defaultEmployeeStatusId: string | null = null;
  try {
    defaultEmployeeStatusId = await getDefaultStatusId(tenantId, 'employee');
  } catch (error) {
    // Mis-seeded tenant (no default employee status configured) — don't fail
    // the whole Opportunity creation over it, just fall back to checking
    // User.status alone.
    console.error(`resolveNextRoundRobinUserId: ${(error as Error).message}`);
  }

  const employees = await prisma.employee.findMany({
    where: { tenantId, userId: { in: orderedIds } },
    select: { userId: true, statusId: true, user: { select: { status: true } } },
  });
  const eligibleIds = new Set(
    employees
      .filter(
        (e) =>
          e.user?.status === 'active' &&
          (defaultEmployeeStatusId === null || e.statusId === defaultEmployeeStatusId),
      )
      .map((e) => e.userId as string),
  );

  const pipeline = await prisma.pipeline.findUnique({ where: { id: pipelineId }, select: { lastAssignedUserId: true } });
  const cursorIndex = pipeline?.lastAssignedUserId ? orderedIds.indexOf(pipeline.lastAssignedUserId) : -1;

  for (let i = 1; i <= orderedIds.length; i++) {
    const candidate = orderedIds[(cursorIndex + i) % orderedIds.length];
    if (eligibleIds.has(candidate)) {
      // Bypasses prisma.pipeline.update on purpose — Pipeline.updatedAt is
      // @default(now()) @updatedAt, and a normal update() would bump it (and
      // look like a human edited the Pipeline) on every single Opportunity
      // creation. Known race: two concurrent creates can read the same
      // cursor and pick the same candidate — accepted at this volume.
      await prisma.$executeRaw`UPDATE "Pipeline" SET "lastAssignedUserId" = ${candidate} WHERE id = ${pipelineId}`;
      return candidate;
    }
  }

  return null;
}
