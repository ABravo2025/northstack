import prisma from '../../lib/prisma.js';
import type { PayFrequencyCadence, PayFrequencyDefinition, Prisma } from '@prisma/client';

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Seeded at tenant creation (same criterion as Pipelines/Statuses) so a new
// tenant doesn't see an empty Payroll section on day one.
const DEFAULT_PAY_FREQUENCIES: { name: string; cadence: PayFrequencyCadence; payAnchor: string }[] = [
  { name: 'Mensual', cadence: 'monthly', payAnchor: 'Último día hábil' },
  { name: 'Quincenal', cadence: 'biweekly', payAnchor: 'Días 15 y 30' },
];

export async function seedDefaultPayFrequencies(tx: PrismaTx, tenantId: string): Promise<void> {
  await tx.payFrequencyDefinition.createMany({
    data: DEFAULT_PAY_FREQUENCIES.map((def, i) => ({
      tenantId,
      name: def.name,
      cadence: def.cadence,
      payAnchor: def.payAnchor,
      order: i,
    })),
  });
}

export interface CreatePayFrequencyInput {
  tenantId: string;
  name: string;
  cadence: PayFrequencyCadence;
  payAnchor: string;
  order?: number;
}

export async function createPayFrequency(input: CreatePayFrequencyInput): Promise<PayFrequencyDefinition> {
  return prisma.payFrequencyDefinition.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      cadence: input.cadence,
      payAnchor: input.payAnchor,
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
  payAnchor?: string;
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
  if (input.payAnchor !== undefined) data.payAnchor = input.payAnchor;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.order !== undefined) data.order = input.order;

  const frequency = await prisma.payFrequencyDefinition.update({ where: { id }, data });
  return { success: true, frequency };
}
