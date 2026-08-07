import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma.js';
import type { PaymentMethodDefinition } from '@prisma/client';

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const DEFAULT_PAYMENT_METHODS = ['Wire transfer', 'Payoneer', 'Wise', 'PayPal'];

export async function seedDefaultPaymentMethods(tx: PrismaTx, tenantId: string): Promise<void> {
  await tx.paymentMethodDefinition.createMany({
    data: DEFAULT_PAYMENT_METHODS.map((name, i) => ({
      id: randomUUID(),
      tenantId,
      name,
      order: i,
    })),
  });
}

export interface CreatePaymentMethodInput {
  tenantId: string;
  name: string;
}

export async function createPaymentMethod(input: CreatePaymentMethodInput): Promise<PaymentMethodDefinition> {
  const maxOrder = await prisma.paymentMethodDefinition.aggregate({
    where: { tenantId: input.tenantId },
    _max: { order: true },
  });

  return prisma.paymentMethodDefinition.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
}

export async function listPaymentMethods(tenantId: string): Promise<PaymentMethodDefinition[]> {
  return prisma.paymentMethodDefinition.findMany({
    where: { tenantId, isActive: true },
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
): Promise<PaymentMethodUpdateResult> {
  const existing = await prisma.paymentMethodDefinition.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    return { success: false, error: 'Payment method not found' };
  }

  const updated = await prisma.paymentMethodDefinition.update({ where: { id }, data: input });
  return { success: true, paymentMethod: updated };
}
