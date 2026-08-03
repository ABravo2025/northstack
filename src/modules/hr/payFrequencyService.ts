import prisma from '../../lib/prisma.js';
import type { PayDueDateOffset, PayFrequencyCadence, PayFrequencyDefinition, Prisma } from '@prisma/client';

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Shape of the JSON-encoded `anchorConfig` column, keyed by cadence — see
// docs/tareas-desarrollo.md, Payroll Unidad 1. Purely a display value in V1
// (no calendar job reads it yet), so validation below stays shallow.
const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function isValidAnchorConfig(cadence: PayFrequencyCadence, config: any): boolean {
  if (typeof config !== 'object' || config === null) return false;
  if (cadence === 'weekly') {
    return DAYS_OF_WEEK.includes(config.dayOfWeek);
  }
  if (cadence === 'semimonthly') {
    if (config.preset === 'first_15' || config.preset === 'fifteen_last') return true;
    return (
      config.preset === 'custom' &&
      Array.isArray(config.days) &&
      config.days.length === 2 &&
      config.days.every((d: unknown) => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 31)
    );
  }
  if (cadence === 'monthly') {
    if (config.preset === 'first_business_day' || config.preset === 'last_business_day') return true;
    return config.preset === 'custom' && Number.isInteger(config.day) && config.day >= 1 && config.day <= 31;
  }
  return false;
}

// Seeded at tenant creation (same criterion as Pipelines/Statuses) so a new
// tenant doesn't see an empty Payroll section on day one.
const DEFAULT_PAY_FREQUENCIES: {
  name: string;
  cadence: PayFrequencyCadence;
  anchorConfig: string;
  dueDateOffset: PayDueDateOffset;
}[] = [
  {
    name: 'Monthly',
    cadence: 'monthly',
    anchorConfig: JSON.stringify({ preset: 'last_business_day' }),
    dueDateOffset: 'same_day',
  },
  {
    name: 'Semimonthly',
    cadence: 'semimonthly',
    anchorConfig: JSON.stringify({ preset: 'fifteen_last' }),
    dueDateOffset: 'same_day',
  },
];

export async function seedDefaultPayFrequencies(tx: PrismaTx, tenantId: string): Promise<void> {
  await tx.payFrequencyDefinition.createMany({
    data: DEFAULT_PAY_FREQUENCIES.map((def, i) => ({
      tenantId,
      name: def.name,
      cadence: def.cadence,
      anchorConfig: def.anchorConfig,
      dueDateOffset: def.dueDateOffset,
      order: i,
    })),
  });
}

export interface CreatePayFrequencyInput {
  tenantId: string;
  name: string;
  cadence: PayFrequencyCadence;
  anchorConfig: string;
  dueDateOffset: PayDueDateOffset;
  dueDateCustomDays?: number;
  order?: number;
}

export async function createPayFrequency(input: CreatePayFrequencyInput): Promise<PayFrequencyDefinition> {
  return prisma.payFrequencyDefinition.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      cadence: input.cadence,
      anchorConfig: input.anchorConfig,
      dueDateOffset: input.dueDateOffset,
      dueDateCustomDays: input.dueDateOffset === 'custom' ? input.dueDateCustomDays : null,
      order: input.order ?? 0,
    },
  });
}

// Includes assignedCount (EmployeeCompensation rows currently vigente —
// effectiveTo: null — pointing at each frequency) so the frontend list
// doesn't need a separate round trip per row.
export async function listPayFrequencies(tenantId: string) {
  const frequencies = await prisma.payFrequencyDefinition.findMany({
    where: { tenantId },
    orderBy: { order: 'asc' },
  });

  const counts = await prisma.employeeCompensation.groupBy({
    by: ['payFrequencyId'],
    where: { tenantId, effectiveTo: null },
    _count: { _all: true },
  });
  const countByFrequencyId = new Map(counts.map((c) => [c.payFrequencyId, c._count._all]));

  return frequencies.map((freq) => ({
    ...freq,
    assignedCount: countByFrequencyId.get(freq.id) ?? 0,
  }));
}

export async function findPayFrequencyById(id: string): Promise<PayFrequencyDefinition | null> {
  return prisma.payFrequencyDefinition.findUnique({ where: { id } });
}

export interface UpdatePayFrequencyInput {
  name?: string;
  cadence?: PayFrequencyCadence;
  anchorConfig?: string;
  dueDateOffset?: PayDueDateOffset;
  dueDateCustomDays?: number | null;
  isActive?: boolean;
  order?: number;
}

export interface PayFrequencyUpdateResult {
  success: boolean;
  frequency?: PayFrequencyDefinition;
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

  // Whitelist explicitly — never spread req.body straight through.
  const data: Prisma.PayFrequencyDefinitionUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.cadence !== undefined) data.cadence = input.cadence;
  if (input.anchorConfig !== undefined) data.anchorConfig = input.anchorConfig;
  if (input.dueDateOffset !== undefined) {
    data.dueDateOffset = input.dueDateOffset;
    data.dueDateCustomDays = input.dueDateOffset === 'custom' ? (input.dueDateCustomDays ?? existing.dueDateCustomDays) : null;
  }
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.order !== undefined) data.order = input.order;

  const frequency = await prisma.payFrequencyDefinition.update({ where: { id }, data });
  return { success: true, frequency };
}
