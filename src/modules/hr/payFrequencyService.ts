import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma.js';
import type { DueDateOffset, PayFrequencyCadence, PayFrequencyDefinition } from '@prisma/client';

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Seeded at tenant creation (docs/spec-payroll.md Unidad 2) — every standard
// combination ready to use immediately; a tenant only creates something new
// for a genuinely custom schedule. Neither dueDateOffset (defaults to
// same_day for all 5) nor "Semanal"'s payday (Friday, the most common
// default) is prescribed by the spec — both are editable from Unidad 3's UI.
const DEFAULT_PAY_FREQUENCIES: { name: string; cadence: PayFrequencyCadence; anchorConfig: Record<string, unknown> }[] = [
  { name: 'Semanal', cadence: 'weekly', anchorConfig: { dayOfWeek: 'friday' } },
  { name: 'Semi-mensual · 1 y 15', cadence: 'semimonthly', anchorConfig: { preset: 'first_15' } },
  { name: 'Semi-mensual · 15 y último día', cadence: 'semimonthly', anchorConfig: { preset: 'fifteen_last' } },
  { name: 'Mensual · primer día hábil', cadence: 'monthly', anchorConfig: { preset: 'first_business_day' } },
  { name: 'Mensual · último día hábil', cadence: 'monthly', anchorConfig: { preset: 'last_business_day' } },
];

// Two createMany calls would be one, but this is a single table (unlike
// seedDefaultPipelines' pipeline+stage pair) — one createMany, same
// client-side-id-generation habit kept anyway for consistency with the other
// seed functions in this codebase.
export async function seedDefaultPayFrequencies(tx: PrismaTx, tenantId: string): Promise<void> {
  await tx.payFrequencyDefinition.createMany({
    data: DEFAULT_PAY_FREQUENCIES.map((def, i) => ({
      id: randomUUID(),
      tenantId,
      name: def.name,
      cadence: def.cadence,
      anchorConfig: JSON.stringify(def.anchorConfig),
      order: i,
    })),
  });
}

export interface CreatePayFrequencyInput {
  tenantId: string;
  name: string;
  cadence: PayFrequencyCadence;
  anchorConfig: Record<string, unknown>;
  dueDateOffset?: DueDateOffset;
  dueDateCustomDays?: number | null;
}

export async function createPayFrequency(input: CreatePayFrequencyInput): Promise<PayFrequencyDefinition> {
  const maxOrder = await prisma.payFrequencyDefinition.aggregate({
    where: { tenantId: input.tenantId },
    _max: { order: true },
  });

  return prisma.payFrequencyDefinition.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      cadence: input.cadence,
      anchorConfig: JSON.stringify(input.anchorConfig),
      dueDateOffset: input.dueDateOffset ?? 'same_day',
      dueDateCustomDays: input.dueDateCustomDays ?? null,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
}

export async function listPayFrequencies(tenantId: string): Promise<PayFrequencyDefinition[]> {
  return prisma.payFrequencyDefinition.findMany({
    where: { tenantId, isActive: true },
    orderBy: { order: 'asc' },
  });
}

export interface PayFrequencyWithAssignedCount extends PayFrequencyDefinition {
  assignedCount: number;
}

// GET /api/hr/pay-frequencies wants "activas + conteo de personas asignadas"
// per docs/spec-payroll.md Unidad 2 — "assigned" means having a *currently
// active* EmployeeCompensation (effectiveTo: null) on that frequency, not
// historical contracts that have since closed.
export async function listPayFrequenciesWithAssignedCount(
  tenantId: string,
): Promise<PayFrequencyWithAssignedCount[]> {
  const [frequencies, counts] = await Promise.all([
    listPayFrequencies(tenantId),
    prisma.employeeCompensation.groupBy({
      by: ['payFrequencyId'],
      where: { tenantId, effectiveTo: null },
      _count: { _all: true },
    }),
  ]);

  const countByFrequencyId = new Map(counts.map((c) => [c.payFrequencyId, c._count._all]));
  return frequencies.map((frequency) => ({
    ...frequency,
    assignedCount: countByFrequencyId.get(frequency.id) ?? 0,
  }));
}

export async function findPayFrequencyById(id: string): Promise<PayFrequencyDefinition | null> {
  return prisma.payFrequencyDefinition.findUnique({ where: { id } });
}

export interface UpdatePayFrequencyInput {
  name?: string;
  cadence?: PayFrequencyCadence;
  anchorConfig?: Record<string, unknown>;
  dueDateOffset?: DueDateOffset;
  dueDateCustomDays?: number | null;
  isActive?: boolean;
  order?: number;
}

export interface PayFrequencyUpdateResult {
  success: boolean;
  payFrequency?: PayFrequencyDefinition;
  error?: string;
}

export async function updatePayFrequency(
  id: string,
  tenantId: string,
  input: UpdatePayFrequencyInput,
): Promise<PayFrequencyUpdateResult> {
  const existing = await prisma.payFrequencyDefinition.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    return { success: false, error: 'Pay frequency not found' };
  }

  const { anchorConfig, ...rest } = input;
  const updated = await prisma.payFrequencyDefinition.update({
    where: { id },
    data: {
      ...rest,
      ...(anchorConfig !== undefined ? { anchorConfig: JSON.stringify(anchorConfig) } : {}),
    },
  });
  return { success: true, payFrequency: updated };
}
