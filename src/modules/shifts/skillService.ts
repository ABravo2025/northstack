import prisma from '../../lib/prisma.js';
import { recordActivity } from '../activity/activityLogService.js';
import { isValidDateString } from './shiftTime.js';

// Shifts module, Unidad 7 (spec-shifts.md §1) — the skills/certifications catalog (Growth): what a
// shift can require ("Reagent handling", "Driver's license") and who holds each one, optionally
// until a date. A missing or expired skill is a WARNING when assigning (shiftRules.ts), never a
// block. Skills are deactivated rather than deleted once anyone holds one, so history stays readable.

const MAX_NAME = 80;

type Result<T> = { success: true; value: T } | { success: false; error: string; field?: string; code?: string };

const SKILL_INCLUDE = {
  holders: {
    include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  },
} as const;

export function serializeSkill(skill: Awaited<ReturnType<typeof findSkill>> & object) {
  return {
    id: skill.id,
    name: skill.name,
    isActive: skill.isActive,
    holders: skill.holders.map((h) => ({
      employeeId: h.employeeId,
      firstName: h.employee.firstName,
      lastName: h.employee.lastName,
      expiresAt: h.expiresAt ? h.expiresAt.toISOString().slice(0, 10) : null,
    })),
  };
}

export function findSkill(id: string) {
  return prisma.skill.findUnique({ where: { id }, include: SKILL_INCLUDE });
}

export async function listSkills(tenantId: string, includeInactive: boolean) {
  const skills = await prisma.skill.findMany({
    where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
    include: SKILL_INCLUDE,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
  return skills.map((s) => serializeSkill(s));
}

export function parseSkillName(value: unknown): Result<string> {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) return { success: false, error: 'Name is required', field: 'name' };
  if (name.length > MAX_NAME) return { success: false, error: `Name must be ${MAX_NAME} characters or fewer`, field: 'name' };
  return { success: true, value: name };
}

async function nameTaken(tenantId: string, name: string, exceptId?: string): Promise<boolean> {
  const existing = await prisma.skill.findFirst({
    where: { tenantId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return existing !== null;
}

async function log(tenantId: string, skillId: string, label: string, action: 'create' | 'update', changedByUserId: string, before: Record<string, unknown> | null, after: Record<string, unknown>) {
  await recordActivity({
    tenantId,
    entityType: 'skill',
    entityId: skillId,
    entityLabel: label,
    action,
    changedByUserId,
    before,
    after,
    fieldConfig: { name: { label: 'Name' }, isActive: { label: 'Active' }, holder: { label: 'Holder' } },
  });
}

export async function createSkill(tenantId: string, input: { name?: unknown }, changedByUserId: string) {
  const parsed = parseSkillName(input.name);
  if (!parsed.success) return parsed;
  if (await nameTaken(tenantId, parsed.value)) return { success: false as const, error: 'A skill with that name already exists', field: 'name' };
  const skill = await prisma.skill.create({ data: { tenantId, name: parsed.value }, include: SKILL_INCLUDE });
  await log(tenantId, skill.id, skill.name, 'create', changedByUserId, null, { name: skill.name, isActive: true });
  return { success: true as const, value: serializeSkill(skill) };
}

export async function updateSkill(
  existing: NonNullable<Awaited<ReturnType<typeof findSkill>>>,
  input: { name?: unknown; isActive?: unknown },
  changedByUserId: string,
): Promise<Result<ReturnType<typeof serializeSkill>>> {
  const data: { name?: string; isActive?: boolean } = {};
  if (input.name !== undefined) {
    const parsed = parseSkillName(input.name);
    if (!parsed.success) return parsed;
    if (await nameTaken(existing.tenantId, parsed.value, existing.id)) return { success: false, error: 'A skill with that name already exists', field: 'name' };
    data.name = parsed.value;
  }
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== 'boolean') return { success: false, error: 'isActive must be true or false', field: 'isActive' };
    data.isActive = input.isActive;
  }
  const skill = await prisma.skill.update({ where: { id: existing.id }, data, include: SKILL_INCLUDE });
  await log(existing.tenantId, skill.id, skill.name, 'update', changedByUserId, { name: existing.name, isActive: existing.isActive }, { name: skill.name, isActive: skill.isActive });
  return { success: true, value: serializeSkill(skill) };
}

// Gives (or updates the expiry of) a skill for one person. expiresAt: "YYYY-MM-DD" or null (never).
export async function setHolder(
  skill: NonNullable<Awaited<ReturnType<typeof findSkill>>>,
  employeeId: string,
  expiresAt: unknown,
  changedByUserId: string,
): Promise<Result<ReturnType<typeof serializeSkill>>> {
  if (expiresAt !== null && expiresAt !== undefined && !isValidDateString(expiresAt)) {
    return { success: false, error: 'Expiry must be a date (YYYY-MM-DD) or empty', field: 'expiresAt' };
  }
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { tenantId: true, firstName: true, lastName: true } });
  if (!employee || employee.tenantId !== skill.tenantId) return { success: false, error: 'Person not found', code: 'not_found' };
  const expiry = typeof expiresAt === 'string' ? new Date(`${expiresAt}T00:00:00.000Z`) : null;
  const previous = skill.holders.find((h) => h.employeeId === employeeId);
  await prisma.employeeSkill.upsert({
    where: { employeeId_skillId: { employeeId, skillId: skill.id } },
    create: { tenantId: skill.tenantId, employeeId, skillId: skill.id, expiresAt: expiry },
    update: { expiresAt: expiry },
  });
  const name = `${employee.firstName} ${employee.lastName}`;
  const describe = (d: Date | null) => `${name}${d ? ` (until ${d.toISOString().slice(0, 10)})` : ''}`;
  await log(skill.tenantId, skill.id, skill.name, 'update', changedByUserId, { holder: previous ? describe(previous.expiresAt) : null }, { holder: describe(expiry) });
  return { success: true, value: serializeSkill((await findSkill(skill.id))!) };
}

export async function removeHolder(
  skill: NonNullable<Awaited<ReturnType<typeof findSkill>>>,
  employeeId: string,
  changedByUserId: string,
): Promise<Result<ReturnType<typeof serializeSkill>>> {
  const holder = skill.holders.find((h) => h.employeeId === employeeId);
  if (!holder) return { success: false, error: 'This person doesn\'t hold that skill', code: 'not_found' };
  await prisma.employeeSkill.delete({ where: { id: holder.id } });
  await log(skill.tenantId, skill.id, skill.name, 'update', changedByUserId, { holder: `${holder.employee.firstName} ${holder.employee.lastName}` }, { holder: null });
  return { success: true, value: serializeSkill((await findSkill(skill.id))!) };
}
