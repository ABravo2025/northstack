import type { ExpenseAccountType, ExpenseDirection, ExpenseKind, FixedExpensePaymentMethod, Prisma } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import {
  decryptAmountCents,
  decryptExpenseData,
  encryptAmountCents,
  encryptExpenseData,
  expenseAmountHash,
} from '../../lib/expenseEncryption.js';
import {
  chargeDate,
  fixedStatus,
  periodBounds,
  periodOf,
  previousPeriod,
  ruleMatches,
  rulePatternFrom,
  sumSpending,
  type FixedStatus,
} from './expenseLogic.js';

// Gastos / Expenses (spec-clientes-gastos-formularios.md, A2/A3). Every read decrypts in the app;
// every lookup is scoped by tenantId first, so a wrong id from another tenant reads as "not found".

export class ExpenseError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

// Seeded once per tenant, lazily. The UI translates them by systemKey; the stored name is only the
// English fallback.
export const DEFAULT_CATEGORIES: { systemKey: string; name: string }[] = [
  { systemKey: 'rent', name: 'Rent' },
  { systemKey: 'utilities', name: 'Utilities' },
  { systemKey: 'fees', name: 'Professional fees' },
  { systemKey: 'insurance', name: 'Insurance' },
  { systemKey: 'taxes', name: 'Taxes' },
  { systemKey: 'software', name: 'Software' },
  { systemKey: 'marketing', name: 'Marketing' },
  { systemKey: 'travel', name: 'Travel' },
  { systemKey: 'suppliers', name: 'Suppliers' },
  { systemKey: 'bank_fees', name: 'Bank fees' },
  { systemKey: 'other', name: 'Other' },
];

export const ACCOUNT_TYPES: ExpenseAccountType[] = ['credit_card', 'bank', 'cash', 'other'];
export const PAYMENT_METHODS: FixedExpensePaymentMethod[] = ['auto_debit', 'card', 'manual'];

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);

// --- Catalog: accounts, categories, departments ----------------------------------------------

export async function ensureDefaultCategories(tenantId: string) {
  const count = await prisma.expenseCategory.count({ where: { tenantId } });
  if (count > 0) return;
  await prisma.expenseCategory.createMany({
    data: DEFAULT_CATEGORIES.map((c, i) => ({ tenantId, systemKey: c.systemKey, name: c.name, order: i })),
    skipDuplicates: true,
  });
}

export async function listCategories(tenantId: string) {
  await ensureDefaultCategories(tenantId);
  const rows = await prisma.expenseCategory.findMany({
    where: { tenantId },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, systemKey: true, order: true, isActive: true, budgetEnc: true },
  });
  // Cruces D4: the monthly budget, decrypted for the screens.
  return rows.map(({ budgetEnc, ...c }) => ({ ...c, budgetCents: budgetEnc ? decryptAmountCents(budgetEnc) : null }));
}

export async function createCategory(tenantId: string, name: string) {
  const order = await prisma.expenseCategory.count({ where: { tenantId } });
  return prisma.expenseCategory.create({
    data: { tenantId, name, order },
    select: { id: true, name: true, systemKey: true, order: true, isActive: true },
  });
}

export async function updateCategory(tenantId: string, id: string, input: { name?: string; isActive?: boolean }) {
  const existing = await prisma.expenseCategory.findFirst({ where: { id, tenantId } });
  if (!existing) throw new ExpenseError('Category not found', 404);
  return prisma.expenseCategory.update({
    where: { id },
    data: {
      // Renaming a seeded category makes it the company's own label from then on.
      ...(input.name !== undefined ? { name: input.name, systemKey: null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    select: { id: true, name: true, systemKey: true, order: true, isActive: true },
  });
}

function presentAccount(a: {
  id: string;
  nameEnc: string;
  type: ExpenseAccountType;
  importProfile: Prisma.JsonValue;
  lastImportAt: Date | null;
  isActive: boolean;
}) {
  return {
    id: a.id,
    name: decryptExpenseData(a.nameEnc),
    type: a.type,
    importProfile: a.importProfile,
    lastImportAt: a.lastImportAt,
    isActive: a.isActive,
  };
}

export async function listAccounts(tenantId: string) {
  const rows = await prisma.expenseAccount.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
  return rows.map(presentAccount);
}

export async function createAccount(tenantId: string, userId: string, input: { name: string; type: ExpenseAccountType }) {
  const row = await prisma.expenseAccount.create({
    data: { tenantId, nameEnc: encryptExpenseData(input.name), type: input.type, createdById: userId },
  });
  return presentAccount(row);
}

export async function updateAccount(
  tenantId: string,
  id: string,
  input: { name?: string; type?: ExpenseAccountType; isActive?: boolean },
) {
  const existing = await prisma.expenseAccount.findFirst({ where: { id, tenantId } });
  if (!existing) throw new ExpenseError('Account not found', 404);
  const row = await prisma.expenseAccount.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { nameEnc: encryptExpenseData(input.name) } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return presentAccount(row);
}

export async function listDepartments(tenantId: string) {
  return prisma.fieldCatalogDefinition.findMany({
    where: { tenantId, kind: 'department', isActive: true },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  });
}

// Ids that come in from a request must belong to the tenant.
async function assertRefs(
  tenantId: string,
  refs: { accountId?: string | null; categoryId?: string | null; departmentId?: string | null; companyId?: string | null },
) {
  const checks: Promise<void>[] = [];
  if (refs.companyId) {
    checks.push(
      prisma.company.findFirst({ where: { id: refs.companyId, tenantId }, select: { id: true } }).then((r) => {
        if (!r) throw new ExpenseError('Company not found', 404);
      }),
    );
  }
  if (refs.accountId) {
    checks.push(
      prisma.expenseAccount.findFirst({ where: { id: refs.accountId, tenantId }, select: { id: true } }).then((r) => {
        if (!r) throw new ExpenseError('Account not found', 404);
      }),
    );
  }
  if (refs.categoryId) {
    checks.push(
      prisma.expenseCategory.findFirst({ where: { id: refs.categoryId, tenantId }, select: { id: true } }).then((r) => {
        if (!r) throw new ExpenseError('Category not found', 404);
      }),
    );
  }
  if (refs.departmentId) {
    checks.push(
      prisma.fieldCatalogDefinition
        .findFirst({ where: { id: refs.departmentId, tenantId, kind: 'department' }, select: { id: true } })
        .then((r) => {
          if (!r) throw new ExpenseError('Department not found', 404);
        }),
    );
  }
  await Promise.all(checks);
}

// --- Movements ----------------------------------------------------------------------------------

const movementSelect = {
  id: true,
  accountId: true,
  date: true,
  descriptionEnc: true,
  amountEnc: true,
  direction: true,
  kind: true,
  categoryId: true,
  departmentId: true,
  companyId: true,
  source: true,
  isEstimated: true,
  fixedExpenseId: true,
  fixedPeriod: true,
  installment: true,
  noteEnc: true,
} satisfies Prisma.ExpenseMovementSelect;

type MovementRow = Prisma.ExpenseMovementGetPayload<{ select: typeof movementSelect }>;

function presentMovement(m: MovementRow) {
  return {
    id: m.id,
    accountId: m.accountId,
    date: dateOnly(m.date),
    description: decryptExpenseData(m.descriptionEnc),
    amountCents: decryptAmountCents(m.amountEnc),
    direction: m.direction,
    kind: m.kind,
    categoryId: m.categoryId,
    departmentId: m.departmentId,
    companyId: m.companyId,
    source: m.source,
    isEstimated: m.isEstimated,
    fixedExpenseId: m.fixedExpenseId,
    fixedPeriod: m.fixedPeriod,
    installment: m.installment,
    note: m.noteEnc ? decryptExpenseData(m.noteEnc) : null,
  };
}

export type ExpenseMovementView = ReturnType<typeof presentMovement>;

export async function listMovements(
  tenantId: string,
  filter: { from: string; to: string; accountId?: string; kind?: ExpenseKind; q?: string },
) {
  const rows = await prisma.expenseMovement.findMany({
    where: {
      tenantId,
      date: { gte: asDate(filter.from), lte: asDate(filter.to) },
      ...(filter.accountId ? { accountId: filter.accountId } : {}),
      ...(filter.kind ? { kind: filter.kind } : {}),
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    select: movementSelect,
  });
  const all = rows.map(presentMovement);
  // Descriptions are encrypted, so text search can only happen after decrypting.
  const q = filter.q?.trim().toLowerCase();
  return q ? all.filter((m) => m.description.toLowerCase().includes(q) || (m.note ?? '').toLowerCase().includes(q)) : all;
}

export async function createManualMovement(
  tenantId: string,
  userId: string,
  input: {
    accountId: string;
    date: string;
    description: string;
    amountCents: number;
    direction: ExpenseDirection;
    categoryId?: string | null;
    departmentId?: string | null;
    companyId?: string | null;
    note?: string | null;
  },
) {
  await assertRefs(tenantId, input);
  const row = await prisma.expenseMovement.create({
    data: {
      tenantId,
      accountId: input.accountId,
      date: asDate(input.date),
      descriptionEnc: encryptExpenseData(input.description),
      amountEnc: encryptAmountCents(input.amountCents),
      amountHash: expenseAmountHash(input.accountId, input.amountCents),
      direction: input.direction,
      kind: input.direction === 'debit' ? 'expense' : 'credit',
      categoryId: input.direction === 'debit' ? (input.categoryId ?? null) : null,
      departmentId: input.departmentId ?? null,
      companyId: input.companyId ?? null,
      source: 'manual',
      noteEnc: input.note ? encryptExpenseData(input.note) : null,
      createdById: userId,
    },
    select: movementSelect,
  });
  return presentMovement(row);
}

// Editing a movement's category teaches a rule ("anything like UBER → Travel") and applies it to
// the tenant's other still-uncategorised expenses that match, so one correction fixes them all.
export async function updateMovement(
  tenantId: string,
  userId: string,
  id: string,
  input: { categoryId?: string | null; departmentId?: string | null; companyId?: string | null; kind?: ExpenseKind; note?: string | null; learnRule?: boolean },
) {
  const existing = await prisma.expenseMovement.findFirst({ where: { id, tenantId }, select: movementSelect });
  if (!existing) throw new ExpenseError('Movement not found', 404);
  await assertRefs(tenantId, { categoryId: input.categoryId, departmentId: input.departmentId, companyId: input.companyId });

  const row = await prisma.expenseMovement.update({
    where: { id },
    data: {
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.note !== undefined ? { noteEnc: input.note ? encryptExpenseData(input.note) : null } : {}),
    },
    select: movementSelect,
  });

  let appliedToOthers = 0;
  if (input.learnRule !== false && input.categoryId && input.categoryId !== existing.categoryId) {
    const pattern = rulePatternFrom(decryptExpenseData(existing.descriptionEnc));
    if (pattern) {
      await prisma.expenseCategoryRule.create({
        data: { tenantId, patternEnc: encryptExpenseData(pattern), categoryId: input.categoryId, createdById: userId },
      });
      const candidates = await prisma.expenseMovement.findMany({
        where: { tenantId, categoryId: null, kind: 'expense', id: { not: id } },
        select: { id: true, descriptionEnc: true },
      });
      const ids = candidates.filter((c) => ruleMatches(pattern, decryptExpenseData(c.descriptionEnc))).map((c) => c.id);
      if (ids.length) {
        appliedToOthers = (
          await prisma.expenseMovement.updateMany({ where: { tenantId, id: { in: ids } }, data: { categoryId: input.categoryId } })
        ).count;
      }
    }
  }
  return { movement: presentMovement(row), appliedToOthers };
}

export async function deleteMovement(tenantId: string, id: string) {
  const existing = await prisma.expenseMovement.findFirst({ where: { id, tenantId }, select: { source: true } });
  if (!existing) throw new ExpenseError('Movement not found', 404);
  // The daily job would book an automatic charge again; it's changed or stopped from its fixed expense.
  if (existing.source === 'fixed_auto') {
    throw new ExpenseError('Automatic charges are managed from their fixed expense.', 409);
  }
  await prisma.expenseMovement.delete({ where: { id } });
}

export async function countRules(tenantId: string) {
  return prisma.expenseCategoryRule.count({ where: { tenantId } });
}

// --- Fixed expenses -------------------------------------------------------------------------------

const fixedSelect = {
  id: true,
  nameEnc: true,
  amountEnc: true,
  dayOfMonth: true,
  paymentMethod: true,
  accountId: true,
  categoryId: true,
  departmentId: true,
  isActive: true,
} satisfies Prisma.FixedExpenseSelect;

type FixedRow = Prisma.FixedExpenseGetPayload<{ select: typeof fixedSelect }>;

export async function listFixed(tenantId: string, period: string, today = todayUtc()) {
  const rows = await prisma.fixedExpense.findMany({
    where: { tenantId },
    orderBy: [{ isActive: 'desc' }, { dayOfMonth: 'asc' }, { createdAt: 'asc' }],
    select: fixedSelect,
  });
  const booked = await prisma.expenseMovement.findMany({
    where: { tenantId, fixedPeriod: period, fixedExpenseId: { in: rows.map((r) => r.id) } },
    select: { id: true, fixedExpenseId: true, isEstimated: true, amountEnc: true, date: true },
  });
  const byFixed = new Map(booked.map((b) => [b.fixedExpenseId!, b]));
  return rows.map((f) => presentFixed(f, period, today, byFixed.get(f.id) ?? null));
}

function presentFixed(
  f: FixedRow,
  period: string,
  today: string,
  booked: { id: string; isEstimated: boolean; amountEnc: string; date: Date } | null,
) {
  const status: FixedStatus = fixedStatus(f.paymentMethod, period, f.dayOfMonth, today, booked);
  return {
    id: f.id,
    name: decryptExpenseData(f.nameEnc),
    amountCents: decryptAmountCents(f.amountEnc),
    dayOfMonth: f.dayOfMonth,
    paymentMethod: f.paymentMethod,
    accountId: f.accountId,
    categoryId: f.categoryId,
    departmentId: f.departmentId,
    isActive: f.isActive,
    period,
    chargeDate: chargeDate(period, f.dayOfMonth),
    status,
    movementId: booked?.id ?? null,
    bookedAmountCents: booked ? decryptAmountCents(booked.amountEnc) : null,
    bookedDate: booked ? dateOnly(booked.date) : null,
  };
}

export type FixedExpenseView = ReturnType<typeof presentFixed>;

export interface FixedInput {
  name: string;
  amountCents: number;
  dayOfMonth: number;
  paymentMethod: FixedExpensePaymentMethod;
  accountId: string;
  categoryId?: string | null;
  departmentId?: string | null;
}

export async function createFixed(tenantId: string, userId: string, input: FixedInput) {
  await assertRefs(tenantId, input);
  const row = await prisma.fixedExpense.create({
    data: {
      tenantId,
      nameEnc: encryptExpenseData(input.name),
      amountEnc: encryptAmountCents(input.amountCents),
      dayOfMonth: input.dayOfMonth,
      paymentMethod: input.paymentMethod,
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      departmentId: input.departmentId ?? null,
      createdById: userId,
    },
    select: fixedSelect,
  });
  const today = todayUtc();
  return presentFixed(row, periodOf(today), today, null);
}

export async function updateFixed(tenantId: string, id: string, input: Partial<FixedInput> & { isActive?: boolean }) {
  const existing = await prisma.fixedExpense.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!existing) throw new ExpenseError('Fixed expense not found', 404);
  await assertRefs(tenantId, input);
  const row = await prisma.fixedExpense.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { nameEnc: encryptExpenseData(input.name) } : {}),
      ...(input.amountCents !== undefined ? { amountEnc: encryptAmountCents(input.amountCents) } : {}),
      ...(input.dayOfMonth !== undefined ? { dayOfMonth: input.dayOfMonth } : {}),
      ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod } : {}),
      ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    select: fixedSelect,
  });
  const today = todayUtc();
  const period = periodOf(today);
  const booked = await prisma.expenseMovement.findFirst({
    where: { tenantId, fixedExpenseId: id, fixedPeriod: period },
    select: { id: true, isEstimated: true, amountEnc: true, date: true },
  });
  return presentFixed(row, period, today, booked);
}

// Only manual-payment fixed expenses are marked paid by hand; auto debit and card book themselves.
export async function markFixedPaid(
  tenantId: string,
  userId: string,
  id: string,
  input: { period: string; date?: string; amountCents?: number },
) {
  const f = await prisma.fixedExpense.findFirst({ where: { id, tenantId }, select: fixedSelect });
  if (!f) throw new ExpenseError('Fixed expense not found', 404);
  if (f.paymentMethod !== 'manual') throw new ExpenseError('This fixed expense is charged automatically.', 409);
  if (!f.accountId) throw new ExpenseError('Choose the account it is paid from first.', 400);
  const amountCents = input.amountCents ?? decryptAmountCents(f.amountEnc);
  try {
    await prisma.expenseMovement.create({
      data: {
        tenantId,
        accountId: f.accountId,
        date: asDate(input.date ?? todayUtc()),
        descriptionEnc: f.nameEnc,
        amountEnc: encryptAmountCents(amountCents),
        amountHash: expenseAmountHash(f.accountId, amountCents),
        direction: 'debit',
        kind: 'expense',
        categoryId: f.categoryId,
        departmentId: f.departmentId,
        source: 'fixed_paid',
        fixedExpenseId: f.id,
        fixedPeriod: input.period,
        createdById: userId,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') throw new ExpenseError('Already paid for this month.', 409);
    throw error;
  }
  const today = todayUtc();
  const booked = await prisma.expenseMovement.findFirst({
    where: { tenantId, fixedExpenseId: id, fixedPeriod: input.period },
    select: { id: true, isEstimated: true, amountEnc: true, date: true },
  });
  return presentFixed(f, input.period, today, booked);
}

// A3: books every auto-debit / card fixed expense whose charge day has come this month, as an
// estimated expense the next CSV import confirms. Idempotent: the (fixedExpenseId, fixedPeriod)
// unique key means a second run — the daily cron, or the lazy run when someone opens Gastos —
// books nothing twice. Pass a tenantId to run for one tenant only.
export async function bookDueFixedExpenses(today = todayUtc(), tenantId?: string) {
  const period = periodOf(today);
  const due = await prisma.fixedExpense.findMany({
    where: {
      isActive: true,
      paymentMethod: { in: ['auto_debit', 'card'] },
      accountId: { not: null },
      ...(tenantId ? { tenantId } : {}),
      movements: { none: { fixedPeriod: period } },
    },
    select: { ...fixedSelect, tenantId: true },
  });
  const rows = due
    .filter((f) => chargeDate(period, f.dayOfMonth) <= today)
    .map((f) => {
      const amountCents = decryptAmountCents(f.amountEnc);
      return {
        tenantId: f.tenantId,
        accountId: f.accountId!,
        date: asDate(chargeDate(period, f.dayOfMonth)),
        descriptionEnc: f.nameEnc,
        amountEnc: f.amountEnc,
        amountHash: expenseAmountHash(f.accountId!, amountCents),
        direction: 'debit' as const,
        kind: 'expense' as const,
        categoryId: f.categoryId,
        departmentId: f.departmentId,
        source: 'fixed_auto' as const,
        isEstimated: true,
        fixedExpenseId: f.id,
        fixedPeriod: period,
      };
    });
  if (!rows.length) return { booked: 0 };
  const result = await prisma.expenseMovement.createMany({ data: rows, skipDuplicates: true });
  return { booked: result.count };
}

// --- Summary (Resumen) ------------------------------------------------------------------------------

export async function getSummary(tenantId: string, period: string, today = todayUtc()) {
  const prev = previousPeriod(period);
  const [current, previous, fixed] = await Promise.all([
    listMovements(tenantId, periodBounds(period)),
    listMovements(tenantId, periodBounds(prev)),
    listFixed(tenantId, period, today),
  ]);
  const now = sumSpending(current);
  const before = sumSpending(previous);
  const active = fixed.filter((f) => f.isActive);
  return {
    period,
    previousPeriod: prev,
    totalCents: now.total,
    fixedCents: now.fixed,
    variableCents: now.variable,
    creditsCents: now.credits,
    previousTotalCents: before.total,
    estimatedCount: current.filter((m) => m.isEstimated).length,
    fixedPaidCount: active.filter((f) => f.status === 'paid' || f.status === 'estimated').length,
    fixedCount: active.length,
    byCategory: [...now.byCategory.entries()]
      .map(([categoryId, cents]) => ({ categoryId, cents }))
      .filter((c) => c.cents > 0)
      .sort((a, b) => b.cents - a.cents),
    due: active.filter((f) => f.status !== 'paid' && f.status !== 'estimated').sort((a, b) => a.chargeDate.localeCompare(b.chargeDate)),
    movementCount: current.length,
  };
}

export async function getTenantCurrency(tenantId: string) {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } });
  return t?.currency ?? 'USD';
}
