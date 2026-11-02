import prisma from '../../lib/prisma.js';
import { decryptAmountCents, decryptExpenseData, encryptAmountCents } from '../../lib/expenseEncryption.js';
import { periodBounds, periodOf, rulePatternFrom, ruleMatches, sumSpending } from './expenseLogic.js';
import { ExpenseError, listMovements } from './expenseService.js';

// Cruces D4 (spec-clientes-gastos-formularios.md): what Gastos notices on its own.
//   budgets:        each category's monthly budget against what's been spent (80% warn, 100% over)
//   subscriptions:  the same charge on the same account in 3+ different months, not a fixed
//                   expense yet — "add it as a fixed expense?"
//   increases:      a fixed expense whose last real charge came in more than 10% above its amount

const DAY = 86_400_000;
export const WARN_PCT = 80;

export function budgetStatus(spent: number, budget: number): 'ok' | 'warn' | 'over' {
  if (budget <= 0) return 'ok';
  const pct = (spent / budget) * 100;
  return pct >= 100 ? 'over' : pct >= WARN_PCT ? 'warn' : 'ok';
}

export async function setCategoryBudget(tenantId: string, categoryId: string, budgetCents: number | null) {
  const cat = await prisma.expenseCategory.findFirst({ where: { id: categoryId, tenantId }, select: { id: true } });
  if (!cat) throw new ExpenseError('Category not found', 404);
  await prisma.expenseCategory.update({ where: { id: categoryId }, data: { budgetEnc: budgetCents && budgetCents > 0 ? encryptAmountCents(budgetCents) : null } });
}

export interface Movementish {
  accountId: string;
  date: string;
  description: string;
  amountCents: number;
  direction: string;
  kind: string;
  categoryId: string | null;
  fixedExpenseId: string | null;
}

// Same account + same normalized description (the category-rule key), charged in 3+ different
// months at a similar amount (within 15% of the median).
export function detectSubscriptions(movements: Movementish[], fixedNames: string[]) {
  const groups = new Map<string, Movementish[]>();
  for (const m of movements) {
    if (m.kind !== 'expense' || m.direction !== 'debit' || m.fixedExpenseId) continue;
    const key = rulePatternFrom(m.description);
    if (!key) continue;
    const k = `${m.accountId}|${key}`;
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  const out: { key: string; accountId: string; name: string; amountCents: number; dayOfMonth: number; months: number; categoryId: string | null }[] = [];
  for (const [k, list] of groups) {
    const months = new Set(list.map((m) => m.date.slice(0, 7)));
    if (months.size < 3) continue;
    const amounts = list.map((m) => m.amountCents).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    if (!amounts.every((a) => Math.abs(a - median) <= median * 0.15)) continue;
    const pattern = k.split('|')[1];
    if (fixedNames.some((n) => ruleMatches(pattern, n) || ruleMatches(rulePatternFrom(n), list[0].description))) continue;
    const days = list.map((m) => Number(m.date.slice(8, 10))).sort((a, b) => a - b);
    const categories = list.map((m) => m.categoryId).filter(Boolean) as string[];
    const latest = [...list].sort((a, b) => b.date.localeCompare(a.date))[0];
    out.push({
      key: k,
      accountId: latest.accountId,
      name: latest.description.slice(0, 120),
      amountCents: median,
      dayOfMonth: days[Math.floor(days.length / 2)],
      months: months.size,
      categoryId: categories.sort((a, b) => categories.filter((x) => x === b).length - categories.filter((x) => x === a).length)[0] ?? null,
    });
  }
  return out.sort((a, b) => b.amountCents - a.amountCents);
}

export async function getInsights(tenantId: string, period: string, today: string) {
  const [categories, current, fixed] = await Promise.all([
    prisma.expenseCategory.findMany({ where: { tenantId, isActive: true, budgetEnc: { not: null } }, select: { id: true, name: true, systemKey: true, budgetEnc: true } }),
    listMovements(tenantId, periodBounds(period)),
    prisma.fixedExpense.findMany({ where: { tenantId, isActive: true }, select: { id: true, nameEnc: true, amountEnc: true, paymentMethod: true } }),
  ]);

  const spent = sumSpending(current).byCategory;
  const budgets = categories.map((c) => {
    const budgetCents = decryptAmountCents(c.budgetEnc!);
    const spentCents = Math.max(0, spent.get(c.id) ?? 0);
    return { categoryId: c.id, budgetCents, spentCents, pct: budgetCents ? Math.round((spentCents / budgetCents) * 100) : 0, status: budgetStatus(spentCents, budgetCents) };
  });

  // Four months back for subscriptions.
  const from = new Date(new Date(`${today}T00:00:00Z`).getTime() - 120 * DAY).toISOString().slice(0, 10);
  const recent = await listMovements(tenantId, { from, to: today });
  const fixedNames = fixed.map((f) => decryptExpenseData(f.nameEnc));
  const subscriptions = detectSubscriptions(recent, fixedNames);

  // The last real (confirmed or paid) charge of each fixed expense, against its amount.
  const lastReal = await prisma.expenseMovement.findMany({
    where: { tenantId, fixedExpenseId: { in: fixed.map((f) => f.id) }, isEstimated: false },
    orderBy: { date: 'desc' },
    distinct: ['fixedExpenseId'],
    select: { fixedExpenseId: true, amountEnc: true, date: true },
  });
  const increases = lastReal
    .map((m) => {
      const f = fixed.find((x) => x.id === m.fixedExpenseId)!;
      const expected = decryptAmountCents(f.amountEnc);
      const actual = decryptAmountCents(m.amountEnc);
      return { fixedExpenseId: f.id, name: decryptExpenseData(f.nameEnc), expectedCents: expected, actualCents: actual, pct: expected ? Math.round(((actual - expected) / expected) * 100) : 0, date: m.date.toISOString().slice(0, 10) };
    })
    .filter((x) => x.pct > 10);

  return { period, budgets, subscriptions, increases, month: periodOf(today) };
}
