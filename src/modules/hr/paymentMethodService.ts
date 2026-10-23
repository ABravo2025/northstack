import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma.js';
import { recordActivity } from '../activity/activityLogService.js';
import { paymentMethodActivityFieldConfig } from '../activity/fieldConfigs/paymentMethodFieldConfig.js';
import type { PaymentMethodDefinition } from '@prisma/client';

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Payroll v2 (spec-payroll-v2.md §0.4, unit 4): the known methods. `asks` is the account detail the
// contract asks the person for. Names are only the stored fallback; the app shows them translated.
export const METHOD_KINDS = {
  bank_ar: { name: 'Bank transfer (CBU/CVU)', asks: 'cbu' },
  mercadopago: { name: 'Mercado Pago', asks: 'cvu' },
  bank_intl: { name: 'Wire transfer', asks: 'iban_ach' },
  wise: { name: 'Wise', asks: 'email' },
  payoneer: { name: 'Payoneer', asks: 'email' },
  paypal: { name: 'PayPal', asks: 'email' },
  cash: { name: 'Cash', asks: 'none' },
} as const;
export type MethodKind = keyof typeof METHOD_KINDS | 'other';
export const isMethodKind = (v: unknown): v is keyof typeof METHOD_KINDS => typeof v === 'string' && v in METHOD_KINDS;
export const asksFor = (kind: string): string => (isMethodKind(kind) ? METHOD_KINDS[kind].asks : 'text');

// On by default, by the company's country (§0.4): Argentina → bank transfer (CBU/CVU) and Mercado
// Pago; everyone else → wire transfer, Wise and Payoneer. Pure (tested).
export function defaultMethodKinds(country: string | null | undefined): (keyof typeof METHOD_KINDS)[] {
  return (country ?? '').toUpperCase() === 'AR' ? ['bank_ar', 'mercadopago'] : ['bank_intl', 'wise', 'payoneer'];
}

export async function seedDefaultPaymentMethods(tx: PrismaTx, tenantId: string, country?: string | null): Promise<void> {
  await tx.paymentMethodDefinition.createMany({
    data: defaultMethodKinds(country).map((kind, i) => ({
      id: randomUUID(),
      tenantId,
      name: METHOD_KINDS[kind].name,
      kind,
      order: i,
    })),
  });
}

// The grid in Settings → Payroll → Payment methods: every known method (on, off, or never added)
// plus the company's own, with how many people are paid with each.
export async function methodsCatalog(tenantId: string) {
  const [rows, usage, tenant] = await Promise.all([
    prisma.paymentMethodDefinition.findMany({ where: { tenantId }, orderBy: { order: 'asc' } }),
    prisma.employeeCompensation.groupBy({ by: ['paymentMethodId'], where: { tenantId, effectiveTo: null, paymentMethodId: { not: null } }, _count: { _all: true } }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { country: true } }),
  ]);
  const used = new Map(usage.map((u) => [u.paymentMethodId, u._count._all]));
  const known = (Object.keys(METHOD_KINDS) as (keyof typeof METHOD_KINDS)[]).map((kind) => {
    const row = rows.find((r) => r.kind === kind);
    return { kind, id: row?.id ?? null, name: row?.name ?? METHOD_KINDS[kind].name, active: row?.isActive ?? false, asks: METHOD_KINDS[kind].asks, people: row ? (used.get(row.id) ?? 0) : 0 };
  });
  const custom = rows
    .filter((r) => !isMethodKind(r.kind))
    .map((r) => ({ kind: 'other' as const, id: r.id, name: r.name, active: r.isActive, asks: 'text', people: used.get(r.id) ?? 0 }));
  return { country: tenant.country, items: [...known, ...custom] };
}

// Turns a known method on or off, adding it the first time.
export async function setKnownMethod(tenantId: string, kind: unknown, active: boolean, changedByUserId: string) {
  if (!isMethodKind(kind)) return { success: false as const, error: 'Unknown payment method' };
  const row = await prisma.paymentMethodDefinition.findFirst({ where: { tenantId, kind } });
  if (row) {
    await updatePaymentMethod(row.id, tenantId, { isActive: active }, changedByUserId);
    return { success: true as const };
  }
  const created = await createPaymentMethod({ tenantId, name: METHOD_KINDS[kind].name, kind }, changedByUserId);
  if (!active) await updatePaymentMethod(created.id, tenantId, { isActive: false }, changedByUserId);
  return { success: true as const };
}

export interface CreatePaymentMethodInput {
  tenantId: string;
  name: string;
  kind?: string;
}

export async function createPaymentMethod(
  input: CreatePaymentMethodInput,
  changedByUserId: string,
): Promise<PaymentMethodDefinition> {
  const maxOrder = await prisma.paymentMethodDefinition.aggregate({
    where: { tenantId: input.tenantId },
    _max: { order: true },
  });

  const method = await prisma.paymentMethodDefinition.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      kind: input.kind ?? 'other',
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });

  await recordActivity({
    tenantId: input.tenantId,
    entityType: 'paymentMethod',
    entityId: method.id,
    entityLabel: method.name,
    action: 'create',
    changedByUserId,
    after: method,
    fieldConfig: paymentMethodActivityFieldConfig,
  });

  return method;
}

// Returns both active and inactive — same reasoning as
// payFrequencyService.listPayFrequencies (the management table needs to show
// and reactivate deactivated ones).
export async function listPaymentMethods(tenantId: string): Promise<PaymentMethodDefinition[]> {
  return prisma.paymentMethodDefinition.findMany({
    where: { tenantId },
    orderBy: { order: 'asc' },
  });
}

export async function findPaymentMethodById(id: string): Promise<PaymentMethodDefinition | null> {
  return prisma.paymentMethodDefinition.findUnique({ where: { id } });
}

export interface UpdatePaymentMethodInput {
  name?: string;
  isActive?: boolean;
  order?: number;
}

export interface PaymentMethodUpdateResult {
  success: boolean;
  paymentMethod?: PaymentMethodDefinition;
  error?: string;
}

export async function updatePaymentMethod(
  id: string,
  tenantId: string,
  input: UpdatePaymentMethodInput,
  changedByUserId: string,
): Promise<PaymentMethodUpdateResult> {
  const existing = await prisma.paymentMethodDefinition.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    return { success: false, error: 'Payment method not found' };
  }

  const updated = await prisma.paymentMethodDefinition.update({ where: { id }, data: input });

  await recordActivity({
    tenantId,
    entityType: 'paymentMethod',
    entityId: id,
    entityLabel: updated.name,
    action: 'update',
    changedByUserId,
    before: existing,
    after: updated,
    fieldConfig: paymentMethodActivityFieldConfig,
  });

  return { success: true, paymentMethod: updated };
}
