import { randomUUID } from 'node:crypto';
import type { ExpenseDirection, Prisma } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import {
  decryptAmountCents,
  decryptExpenseData,
  encryptAmountCents,
  encryptExpenseData,
  expenseAmountHash,
} from '../../lib/expenseEncryption.js';
import {
  CONFIRM_DAYS,
  CONFIRM_TOLERANCE,
  DUPLICATE_DAYS,
  RECONCILE_TOLERANCE,
  daysBetween,
  isInternalTransfer,
  normalizeInstallment,
  periodOf,
  ruleMatches,
  withinTolerance,
} from './expenseLogic.js';
import { ExpenseError } from './expenseService.js';

// Gastos → CSV import (spec-clientes-gastos-formularios.md, A4). The file never reaches the server:
// the browser parses it and sends rows already normalized to a positive amount + direction. The
// same plan runs twice — once as the wizard's preview, once on confirm — so what the person
// reviewed is exactly what gets saved, and nothing they sent is trusted beyond its own row.

export const MAX_IMPORT_ROWS = 2000;

export interface ImportRowInput {
  date: string;
  description: string;
  amountCents: number;
  direction: ExpenseDirection;
  installment?: string | null;
  // The person chose "import anyway" on a row the preview flagged as a duplicate.
  forceImport?: boolean;
}

export type ImportRowStatus = 'expense' | 'credit' | 'internal' | 'duplicate' | 'invalid';

export interface ImportRowPlan {
  index: number;
  status: ImportRowStatus;
  date: string;
  description: string;
  amountCents: number;
  direction: ExpenseDirection;
  installment: string | null;
  categoryId: string | null;
  duplicateOf: { id: string; date: string; description: string } | null;
  // The real charge that replaces an automatic fixed expense's estimated movement.
  confirms: { movementId: string; description: string; estimatedCents: number } | null;
  // The payment of a manual fixed expense not yet paid that month.
  reconciles: { fixedExpenseId: string; name: string; period: string } | null;
}

const isIsoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const shiftDays = (s: string, days: number) => dateOnly(new Date(asDate(s).getTime() + days * 86_400_000));

// Shape-checks one incoming row; anything unusable becomes an "invalid" row the preview shows.
export function sanitizeImportRow(raw: unknown): ImportRowInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const description = typeof r.description === 'string' ? r.description.trim().slice(0, 300) : '';
  const amount = r.amountCents;
  if (!isIsoDate(r.date) || !description) return null;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) return null;
  if (r.direction !== 'debit' && r.direction !== 'credit') return null;
  return {
    date: r.date,
    description,
    amountCents: amount,
    direction: r.direction,
    installment: normalizeInstallment(r.installment),
    forceImport: r.forceImport === true,
  };
}

export async function planImport(tenantId: string, accountId: string, rawRows: unknown[]): Promise<ImportRowPlan[]> {
  const account = await prisma.expenseAccount.findFirst({ where: { id: accountId, tenantId }, select: { id: true } });
  if (!account) throw new ExpenseError('Account not found', 404);
  if (rawRows.length > MAX_IMPORT_ROWS) throw new ExpenseError(`At most ${MAX_IMPORT_ROWS} rows per import.`, 400);

  const rows = rawRows.map(sanitizeImportRow);
  const dates = rows.filter((r): r is ImportRowInput => !!r).map((r) => r.date).sort();
  if (!dates.length) {
    return rawRows.map((_, index) => invalidRow(index));
  }
  const from = shiftDays(dates[0], -CONFIRM_DAYS);
  const to = shiftDays(dates[dates.length - 1], CONFIRM_DAYS);
  const periods = [...new Set(dates.map(periodOf))];

  const [existing, manualFixed, rules] = await Promise.all([
    prisma.expenseMovement.findMany({
      where: { tenantId, accountId, date: { gte: asDate(from), lte: asDate(to) } },
      select: { id: true, date: true, descriptionEnc: true, amountEnc: true, amountHash: true, isEstimated: true, categoryId: true },
    }),
    prisma.fixedExpense.findMany({
      where: { tenantId, accountId, paymentMethod: 'manual', isActive: true },
      select: { id: true, nameEnc: true, amountEnc: true, categoryId: true, movements: { where: { fixedPeriod: { in: periods } }, select: { fixedPeriod: true } } },
    }),
    prisma.expenseCategoryRule.findMany({
      where: { tenantId, category: { isActive: true } },
      orderBy: { createdAt: 'desc' },
      select: { patternEnc: true, categoryId: true },
    }),
  ]);

  const movements = existing.map((m) => ({ ...m, day: dateOnly(m.date), cents: decryptAmountCents(m.amountEnc) }));
  const fixed = manualFixed.map((f) => ({
    id: f.id,
    name: decryptExpenseData(f.nameEnc),
    cents: decryptAmountCents(f.amountEnc),
    categoryId: f.categoryId,
    paidPeriods: new Set(f.movements.map((m) => m.fixedPeriod)),
  }));
  const learned = rules.map((r) => ({ pattern: decryptExpenseData(r.patternEnc), categoryId: r.categoryId }));
  const categoryFor = (description: string) => learned.find((r) => ruleMatches(r.pattern, description))?.categoryId ?? null;

  // Each existing movement / fixed-month can be matched by one row only, so a statement with two
  // identical purchases against one already saved imports the second.
  const used = new Set<string>();

  return rows.map((row, index): ImportRowPlan => {
    if (!row) return invalidRow(index);
    const base: ImportRowPlan = {
      index,
      status: row.direction === 'debit' ? 'expense' : 'credit',
      date: row.date,
      description: row.description,
      amountCents: row.amountCents,
      direction: row.direction,
      installment: row.installment ?? null,
      categoryId: null,
      duplicateOf: null,
      confirms: null,
      reconciles: null,
    };
    if (isInternalTransfer(row.description)) return { ...base, status: 'internal' };

    if (row.direction === 'debit') {
      const estimate = movements.find(
        (m) =>
          m.isEstimated &&
          !used.has(m.id) &&
          withinTolerance(row.amountCents, m.cents, CONFIRM_TOLERANCE) &&
          daysBetween(m.day, row.date) <= CONFIRM_DAYS,
      );
      if (estimate) {
        used.add(estimate.id);
        return {
          ...base,
          categoryId: estimate.categoryId,
          confirms: { movementId: estimate.id, description: decryptExpenseData(estimate.descriptionEnc), estimatedCents: estimate.cents },
        };
      }
    }

    const hash = expenseAmountHash(accountId, row.amountCents);
    const duplicate = movements.find(
      (m) => !m.isEstimated && !used.has(m.id) && m.amountHash === hash && daysBetween(m.day, row.date) <= DUPLICATE_DAYS,
    );
    if (duplicate) {
      used.add(duplicate.id);
      const duplicateOf = { id: duplicate.id, date: duplicate.day, description: decryptExpenseData(duplicate.descriptionEnc) };
      if (!row.forceImport) return { ...base, status: 'duplicate', duplicateOf };
      base.duplicateOf = duplicateOf;
    }

    if (row.direction === 'credit') return base;

    const period = periodOf(row.date);
    const owed = fixed.find(
      (f) => !f.paidPeriods.has(period) && !used.has(`${f.id}:${period}`) && withinTolerance(row.amountCents, f.cents, RECONCILE_TOLERANCE),
    );
    if (owed) {
      used.add(`${owed.id}:${period}`);
      return { ...base, categoryId: owed.categoryId ?? categoryFor(row.description), reconciles: { fixedExpenseId: owed.id, name: owed.name, period } };
    }
    return { ...base, categoryId: categoryFor(row.description) };
  });
}

function invalidRow(index: number): ImportRowPlan {
  return {
    index,
    status: 'invalid',
    date: '',
    description: '',
    amountCents: 0,
    direction: 'debit',
    installment: null,
    categoryId: null,
    duplicateOf: null,
    confirms: null,
    reconciles: null,
  };
}

// The saved import format: how the file is laid out, never anything read from its rows.
export function sanitizeImportProfile(raw: unknown): Prisma.InputJsonObject | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : null);
  const convention = pick(p.convention, ['neg_debit', 'neg_credit', 'cols', 'type_col'] as const);
  const numberFormat = pick(p.numberFormat, ['ar', 'us'] as const);
  const dateFormat = pick(p.dateFormat, ['dmy', 'mdy', 'ymd'] as const);
  if (!convention || !numberFormat || !dateFormat) return null;
  const columns: Record<string, string> = {};
  if (p.columns && typeof p.columns === 'object') {
    for (const key of ['date', 'description', 'amount', 'debit', 'credit', 'type', 'installment']) {
      const v = (p.columns as Record<string, unknown>)[key];
      if (typeof v === 'string' && v.trim()) columns[key] = v.trim().slice(0, 80);
    }
  }
  return { convention, numberFormat, dateFormat, columns, label: convention };
}

export async function commitImport(
  tenantId: string,
  userId: string,
  accountId: string,
  rawRows: unknown[],
  profile: Prisma.InputJsonObject | null,
) {
  const plan = await planImport(tenantId, accountId, rawRows);
  const batchId = randomUUID();
  const toCreate = plan.filter((r) => (r.status === 'expense' || r.status === 'credit' || r.status === 'internal') && !r.confirms);
  const toConfirm = plan.filter((r) => r.confirms);

  const writes: Prisma.PrismaPromise<unknown>[] = toConfirm.map((r) =>
    prisma.expenseMovement.update({
      where: { id: r.confirms!.movementId },
      data: {
        date: asDate(r.date),
        amountEnc: encryptAmountCents(r.amountCents),
        amountHash: expenseAmountHash(accountId, r.amountCents),
        isEstimated: false,
        importBatchId: batchId,
      },
    }),
  );
  if (toCreate.length) {
    writes.push(
      prisma.expenseMovement.createMany({
        data: toCreate.map((r) => ({
          tenantId,
          accountId,
          date: asDate(r.date),
          descriptionEnc: encryptExpenseData(r.description),
          amountEnc: encryptAmountCents(r.amountCents),
          amountHash: expenseAmountHash(accountId, r.amountCents),
          direction: r.direction,
          kind: r.status === 'internal' ? 'internal' : r.status === 'credit' ? 'credit' : 'expense',
          categoryId: r.status === 'expense' ? r.categoryId : null,
          source: 'csv_import' as const,
          fixedExpenseId: r.reconciles?.fixedExpenseId ?? null,
          fixedPeriod: r.reconciles?.period ?? null,
          installment: r.installment,
          importBatchId: batchId,
          createdById: userId,
        })),
      }),
    );
  }
  writes.push(
    prisma.expenseAccount.update({
      where: { id: accountId },
      data: { lastImportAt: new Date(), ...(profile ? { importProfile: profile } : {}) },
    }),
  );

  try {
    await prisma.$transaction(writes);
  } catch (error) {
    // Someone marked the same fixed expense paid while this import was being reviewed.
    if ((error as { code?: string }).code === 'P2002') {
      throw new ExpenseError('A fixed expense in this file was just paid. Review the import again.', 409);
    }
    throw error;
  }

  const count = (s: ImportRowStatus) => plan.filter((r) => r.status === s).length;
  return {
    imported: toCreate.length,
    confirmed: toConfirm.length,
    reconciled: plan.filter((r) => r.reconciles).length,
    internal: count('internal'),
    duplicatesSkipped: count('duplicate'),
    invalid: count('invalid'),
  };
}
