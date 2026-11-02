import type express from 'express';
import type { ExpenseAccountType, ExpenseDirection, ExpenseKind, FixedExpensePaymentMethod } from '@prisma/client';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { requireExpensesAccess } from '../lib/expensesAccess.js';
import { isPeriod, parseAmountToCents, periodBounds, periodOf } from '../modules/expenses/expenseLogic.js';
import {
  ACCOUNT_TYPES,
  ExpenseError,
  PAYMENT_METHODS,
  bookDueFixedExpenses,
  countRules,
  createAccount,
  createCategory,
  createFixed,
  createManualMovement,
  deleteMovement,
  getSummary,
  getTenantCurrency,
  listAccounts,
  listCategories,
  listDepartments,
  listFixed,
  listMovements,
  markFixedPaid,
  todayUtc,
  updateAccount,
  updateCategory,
  updateFixed,
  updateMovement,
} from '../modules/expenses/expenseService.js';
import { commitImport, planImport, sanitizeImportProfile } from '../modules/expenses/expenseImportService.js';
import { getExpensesDashboard } from '../modules/expenses/expenseDashboardService.js';

// Gastos / Expenses (spec-clientes-gastos-formularios.md, A2). Owner-only by default
// (manage_expenses), Growth-only, and 503 until EXPENSES_DATA_ENCRYPTION_KEY is set.
export const expensesRouter = createAsyncRouter();

const KINDS: ExpenseKind[] = ['expense', 'credit', 'internal'];
const DIRECTIONS: ExpenseDirection[] = ['debit', 'credit'];

async function guard(req: express.Request, res: express.Response) {
  const user = await validateSession(req, res);
  if (!user) return null;
  if (!requireExpensesAccess(user, res)) return null;
  return user;
}

function fail(res: express.Response, error: unknown) {
  if (error instanceof ExpenseError) return res.status(error.status).json({ error: error.message });
  throw error;
}

const text = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const optionalId = (v: unknown) => (v === null || v === '' ? null : typeof v === 'string' ? v : undefined);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

// Everything the screens need to render names: accounts, categories, departments, the currency.
// Opening Gastos also books any automatic charge whose day has come (idempotent, see A3).
expensesRouter.get('/api/expenses/meta', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  const tenantId = user.tenantId!;
  await bookDueFixedExpenses(todayUtc(), tenantId);
  const [accounts, categories, departments, currency, ruleCount] = await Promise.all([
    listAccounts(tenantId),
    listCategories(tenantId),
    listDepartments(tenantId),
    getTenantCurrency(tenantId),
    countRules(tenantId),
  ]);
  return res.json({ accounts, categories, departments, currency, ruleCount, today: todayUtc() });
});

expensesRouter.get('/api/expenses/summary', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  const period = isPeriod(req.query.period) ? req.query.period : periodOf(todayUtc());
  return res.json(await getSummary(user.tenantId!, period));
});

// --- Accounts ---

expensesRouter.post('/api/expenses/accounts', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  const name = text(req.body.name, 120);
  const type = req.body.type as ExpenseAccountType;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!ACCOUNT_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid account type' });
  return res.status(201).json(await createAccount(user.tenantId!, user.id, { name, type }));
});

expensesRouter.patch('/api/expenses/accounts/:id', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  const input: { name?: string; type?: ExpenseAccountType; isActive?: boolean } = {};
  if (req.body.name !== undefined) {
    input.name = text(req.body.name, 120);
    if (!input.name) return res.status(400).json({ error: 'Name is required' });
  }
  if (req.body.type !== undefined) {
    if (!ACCOUNT_TYPES.includes(req.body.type)) return res.status(400).json({ error: 'Invalid account type' });
    input.type = req.body.type;
  }
  if (typeof req.body.isActive === 'boolean') input.isActive = req.body.isActive;
  try {
    return res.json(await updateAccount(user.tenantId!, req.params.id, input));
  } catch (error) {
    return fail(res, error);
  }
});

// --- Categories ---

expensesRouter.post('/api/expenses/categories', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  const name = text(req.body.name, 60);
  if (!name) return res.status(400).json({ error: 'Name is required' });
  await listCategories(user.tenantId!); // seed first, so the new one is ordered after the defaults
  return res.status(201).json(await createCategory(user.tenantId!, name));
});

expensesRouter.patch('/api/expenses/categories/:id', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  const input: { name?: string; isActive?: boolean } = {};
  if (req.body.name !== undefined) {
    input.name = text(req.body.name, 60);
    if (!input.name) return res.status(400).json({ error: 'Name is required' });
  }
  if (typeof req.body.isActive === 'boolean') input.isActive = req.body.isActive;
  try {
    return res.json(await updateCategory(user.tenantId!, req.params.id, input));
  } catch (error) {
    return fail(res, error);
  }
});

// --- Movements ---

expensesRouter.get('/api/expenses/movements', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  const period = isPeriod(req.query.period) ? req.query.period : periodOf(todayUtc());
  const bounds = isDate(req.query.from) && isDate(req.query.to) ? { from: req.query.from, to: req.query.to } : periodBounds(period);
  const kind = KINDS.includes(req.query.kind as ExpenseKind) ? (req.query.kind as ExpenseKind) : undefined;
  const accountId = typeof req.query.accountId === 'string' && req.query.accountId ? req.query.accountId : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : undefined;
  return res.json(await listMovements(user.tenantId!, { ...bounds, accountId, kind, q }));
});

expensesRouter.post('/api/expenses/movements', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  const description = text(req.body.description);
  const amountCents = parseAmountToCents(req.body.amount);
  const direction: ExpenseDirection = DIRECTIONS.includes(req.body.direction) ? req.body.direction : 'debit';
  if (!description) return res.status(400).json({ error: 'Description is required' });
  if (amountCents === null) return res.status(400).json({ error: 'Enter an amount greater than zero' });
  if (typeof req.body.accountId !== 'string' || !req.body.accountId) return res.status(400).json({ error: 'Account is required' });
  const date = isDate(req.body.date) ? req.body.date : todayUtc();
  try {
    const movement = await createManualMovement(user.tenantId!, user.id, {
      accountId: req.body.accountId,
      date,
      description,
      amountCents,
      direction,
      categoryId: optionalId(req.body.categoryId),
      departmentId: optionalId(req.body.departmentId),
      companyId: optionalId(req.body.companyId),
      note: text(req.body.note, 500) || null,
    });
    return res.status(201).json(movement);
  } catch (error) {
    return fail(res, error);
  }
});

expensesRouter.patch('/api/expenses/movements/:id', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  const input: Parameters<typeof updateMovement>[3] = {};
  if (req.body.categoryId !== undefined) input.categoryId = optionalId(req.body.categoryId);
  if (req.body.departmentId !== undefined) input.departmentId = optionalId(req.body.departmentId);
  if (req.body.companyId !== undefined) input.companyId = optionalId(req.body.companyId);
  if (req.body.kind !== undefined) {
    if (!KINDS.includes(req.body.kind)) return res.status(400).json({ error: 'Invalid type' });
    input.kind = req.body.kind;
  }
  if (req.body.note !== undefined) input.note = text(req.body.note, 500) || null;
  if (req.body.learnRule === false) input.learnRule = false;
  try {
    return res.json(await updateMovement(user.tenantId!, user.id, req.params.id, input));
  } catch (error) {
    return fail(res, error);
  }
});

expensesRouter.delete('/api/expenses/movements/:id', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  try {
    await deleteMovement(user.tenantId!, req.params.id);
    return res.status(204).end();
  } catch (error) {
    return fail(res, error);
  }
});

// --- Fixed expenses ---

expensesRouter.get('/api/expenses/fixed', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  const period = isPeriod(req.query.period) ? req.query.period : periodOf(todayUtc());
  return res.json(await listFixed(user.tenantId!, period));
});

function parseFixedBody(body: Record<string, unknown>, partial: boolean) {
  const out: Record<string, unknown> = {};
  if (!partial || body.name !== undefined) {
    const name = text(body.name, 120);
    if (!name) return { error: 'Name is required' };
    out.name = name;
  }
  if (!partial || body.amount !== undefined) {
    const cents = parseAmountToCents(body.amount);
    if (cents === null) return { error: 'Enter an amount greater than zero' };
    out.amountCents = cents;
  }
  if (!partial || body.dayOfMonth !== undefined) {
    const day = Number(body.dayOfMonth);
    if (!Number.isInteger(day) || day < 1 || day > 31) return { error: 'Charge day must be between 1 and 31' };
    out.dayOfMonth = day;
  }
  if (!partial || body.paymentMethod !== undefined) {
    if (!PAYMENT_METHODS.includes(body.paymentMethod as FixedExpensePaymentMethod)) return { error: 'Invalid payment method' };
    out.paymentMethod = body.paymentMethod;
  }
  if (!partial || body.accountId !== undefined) {
    if (typeof body.accountId !== 'string' || !body.accountId) return { error: 'Account is required' };
    out.accountId = body.accountId;
  }
  if (body.categoryId !== undefined) out.categoryId = optionalId(body.categoryId);
  if (body.departmentId !== undefined) out.departmentId = optionalId(body.departmentId);
  if (typeof body.isActive === 'boolean') out.isActive = body.isActive;
  return { input: out };
}

expensesRouter.post('/api/expenses/fixed', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  const parsed = parseFixedBody(req.body, false);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });
  try {
    const created = await createFixed(user.tenantId!, user.id, parsed.input as unknown as Parameters<typeof createFixed>[2]);
    // A charge day already past this month books right away, like the daily job would.
    await bookDueFixedExpenses(todayUtc(), user.tenantId!);
    return res.status(201).json(created);
  } catch (error) {
    return fail(res, error);
  }
});

expensesRouter.patch('/api/expenses/fixed/:id', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  const parsed = parseFixedBody(req.body, true);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });
  try {
    return res.json(await updateFixed(user.tenantId!, req.params.id, parsed.input));
  } catch (error) {
    return fail(res, error);
  }
});

expensesRouter.post('/api/expenses/fixed/:id/pay', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  const period = isPeriod(req.body.period) ? req.body.period : periodOf(todayUtc());
  const amountCents = req.body.amount !== undefined ? parseAmountToCents(req.body.amount) : undefined;
  if (amountCents === null) return res.status(400).json({ error: 'Enter an amount greater than zero' });
  try {
    const result = await markFixedPaid(user.tenantId!, user.id, req.params.id, {
      period,
      date: isDate(req.body.date) ? req.body.date : undefined,
      amountCents,
    });
    return res.json(result);
  } catch (error) {
    return fail(res, error);
  }
});

// --- CSV import (A4) ---
// The browser parses the file; these receive normalized rows only. Preview and import run the same
// plan, so the wizard shows exactly what will be saved.

function importBody(body: Record<string, unknown> | undefined) {
  const accountId = typeof body?.accountId === 'string' ? body.accountId : '';
  const rows = Array.isArray(body?.rows) ? (body!.rows as unknown[]) : null;
  if (!accountId) return { error: 'Choose the account the file is from' } as const;
  if (!rows || rows.length === 0) return { error: 'The file has no rows to import' } as const;
  return { accountId, rows } as const;
}

expensesRouter.post('/api/expenses/import/preview', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  const parsed = importBody(req.body);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });
  try {
    return res.json({ rows: await planImport(user.tenantId!, parsed.accountId, parsed.rows) });
  } catch (error) {
    return fail(res, error);
  }
});

expensesRouter.post('/api/expenses/import', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  const parsed = importBody(req.body);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });
  try {
    const profile = req.body.saveProfile === false ? null : sanitizeImportProfile(req.body.profile);
    return res.json(await commitImport(user.tenantId!, user.id, parsed.accountId, parsed.rows, profile));
  } catch (error) {
    return fail(res, error);
  }
});

// --- Dashboards → Gastos (A7) ---
// The range comes from the Dashboards date filter; departmentId narrows it ("none" = unassigned).
expensesRouter.get('/api/expenses/dashboard', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  const today = todayUtc();
  const from = isDate(req.query.from) ? req.query.from : periodBounds(periodOf(today)).from;
  const to = isDate(req.query.to) ? req.query.to : today;
  if (from > to) return res.status(400).json({ error: 'The start date must be before the end date' });
  const departmentId = typeof req.query.departmentId === 'string' && req.query.departmentId ? req.query.departmentId : undefined;
  const [dashboard, currency] = await Promise.all([
    getExpensesDashboard(user.tenantId!, { from, to, departmentId }),
    getTenantCurrency(user.tenantId!),
  ]);
  return res.json({ ...dashboard, currency });
});
