import prisma from '../../lib/prisma.js';
import { decryptAmountCents, decryptExpenseData } from '../../lib/expenseEncryption.js';
import { periodOf, rulePatternFrom } from './expenseLogic.js';

// Dashboards → Gastos (spec-clientes-gastos-formularios.md, A7). Amounts are encrypted, so nothing
// is summed in SQL: the range's movements are decrypted and aggregated here (SME volumes). Same
// counting rules as the Resumen: internal transfers never count, credits are reported apart, and a
// refund (an expense-kind credit) nets against spending.

export const NO_DEPARTMENT = 'none';
const MAX_MONTHS = 24;

const asDate = (s: string) => new Date(`${s}T00:00:00Z`);

export async function getExpensesDashboard(tenantId: string, filter: { from: string; to: string; departmentId?: string }) {
  const rows = await prisma.expenseMovement.findMany({
    where: {
      tenantId,
      date: { gte: asDate(filter.from), lte: asDate(filter.to) },
      kind: { not: 'internal' },
      ...(filter.departmentId === NO_DEPARTMENT ? { departmentId: null } : filter.departmentId ? { departmentId: filter.departmentId } : {}),
    },
    select: {
      date: true,
      descriptionEnc: true,
      amountEnc: true,
      direction: true,
      kind: true,
      categoryId: true,
      departmentId: true,
      fixedExpenseId: true,
      isEstimated: true,
    },
  });

  let total = 0;
  let fixed = 0;
  let credits = 0;
  let expenseCount = 0;
  let estimatedCount = 0;
  const byCategory = new Map<string | null, number>();
  const byDepartment = new Map<string | null, number>();
  const byMerchant = new Map<string, { cents: number; count: number }>();
  const byMonth = new Map<string, { fixed: number; variable: number }>();

  for (const m of rows) {
    const cents = decryptAmountCents(m.amountEnc);
    if (m.kind === 'credit') {
      credits += cents;
      continue;
    }
    const signed = m.direction === 'debit' ? cents : -cents;
    const month = periodOf(m.date.toISOString().slice(0, 10));
    total += signed;
    if (m.direction === 'debit') expenseCount++;
    if (m.isEstimated) estimatedCount++;
    if (m.fixedExpenseId) fixed += signed;
    byCategory.set(m.categoryId, (byCategory.get(m.categoryId) ?? 0) + signed);
    byDepartment.set(m.departmentId, (byDepartment.get(m.departmentId) ?? 0) + signed);
    const bucket = byMonth.get(month) ?? { fixed: 0, variable: 0 };
    if (m.fixedExpenseId) bucket.fixed += signed;
    else bucket.variable += signed;
    byMonth.set(month, bucket);
    // "Where the money goes": purchases grouped by the same normalized key the category rules use,
    // so "UBER *TRIP 4821" and "UBER *TRIP 9930" are one place. Only debits — a refund isn't a place.
    if (m.direction === 'debit') {
      const key = rulePatternFrom(decryptExpenseData(m.descriptionEnc)) || '—';
      const merchant = byMerchant.get(key) ?? { cents: 0, count: 0 };
      merchant.cents += cents;
      merchant.count++;
      byMerchant.set(key, merchant);
    }
  }

  const sorted = <K>(map: Map<K, number>) =>
    [...map.entries()].filter(([, cents]) => cents > 0).sort((a, b) => b[1] - a[1]);

  return {
    from: filter.from,
    to: filter.to,
    totalCents: total,
    fixedCents: fixed,
    variableCents: total - fixed,
    creditsCents: credits,
    expenseCount,
    estimatedCount,
    byCategory: sorted(byCategory).map(([categoryId, cents]) => ({ categoryId, cents })),
    byDepartment: sorted(byDepartment).map(([departmentId, cents]) => ({ departmentId, cents })),
    topMerchants: [...byMerchant.entries()]
      .sort((a, b) => b[1].cents - a[1].cents)
      .slice(0, 8)
      .map(([name, v]) => ({ name, cents: v.cents, count: v.count })),
    byMonth: monthsBetween(filter.from, filter.to).map((month) => ({
      month,
      fixedCents: byMonth.get(month)?.fixed ?? 0,
      variableCents: byMonth.get(month)?.variable ?? 0,
    })),
  };
}

// Every month the range touches, oldest first — the last MAX_MONTHS when the range is longer
// ("all time" starts in 2020).
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out.slice(-MAX_MONTHS);
}
