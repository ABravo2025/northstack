import prisma from '../../lib/prisma.js';
import { decryptAmountCents, decryptExpenseData } from '../../lib/expenseEncryption.js';
import { isClientsAllowed } from '../tenant/planLimits.js';
import { chargeDate, periodOf } from './expenseLogic.js';

// Cruces D2 (spec-clientes-gastos-formularios.md): the next 13 weeks of cash, week by week.
//   out: every active fixed expense on its charge day, and the installments still to come of card
//        purchases bought in installments ("03/12" → nine more, one a month)
//   in:  recurring revenue from clients' products (monthly on the day they started, yearly on the
//        anniversary), when the company has the Clients module
// In the company's currency only (products in another currency are left out and counted). With an
// opening balance, each week shows the running balance and a negative one is flagged.

const DAY = 86_400_000;
export const WEEKS = 13;

type Item = { date: string; label: string; cents: number; kind: 'fixed' | 'installment' | 'revenue' };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addMonths = (dateIso: string, n: number) => {
  const [y, m, d] = dateIso.split('-').map(Number);
  const period = periodOf(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10));
  return chargeDate(period, d);
};

export function weekBuckets(today: string, items: Item[], openingCents: number | null) {
  const start = new Date(`${today}T00:00:00Z`).getTime();
  const weeks = Array.from({ length: WEEKS }, (_, i) => ({
    start: iso(new Date(start + i * 7 * DAY)),
    end: iso(new Date(start + (i * 7 + 6) * DAY)),
    inCents: 0,
    outCents: 0,
    netCents: 0,
    balanceCents: null as number | null,
    items: [] as Item[],
  }));
  for (const it of items) {
    const idx = Math.floor((new Date(`${it.date}T00:00:00Z`).getTime() - start) / (7 * DAY));
    if (idx < 0 || idx >= WEEKS) continue;
    const w = weeks[idx];
    if (it.cents >= 0) w.inCents += it.cents;
    else w.outCents += -it.cents;
    w.items.push(it);
  }
  let balance = openingCents;
  for (const w of weeks) {
    w.netCents = w.inCents - w.outCents;
    w.items.sort((a, b) => a.date.localeCompare(b.date));
    if (balance !== null) {
      balance += w.netCents;
      w.balanceCents = balance;
    }
  }
  return weeks;
}

export async function projectCashflow(tenantId: string, today: string, openingCents: number | null) {
  const end = iso(new Date(new Date(`${today}T00:00:00Z`).getTime() + (WEEKS * 7 - 1) * DAY));
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const currency = tenant?.currency ?? 'USD';
  const items: Item[] = [];

  // Fixed expenses on each charge day in the window.
  const fixed = await prisma.fixedExpense.findMany({ where: { tenantId, isActive: true }, select: { nameEnc: true, amountEnc: true, dayOfMonth: true } });
  for (const f of fixed) {
    const name = decryptExpenseData(f.nameEnc);
    const cents = decryptAmountCents(f.amountEnc);
    for (let n = 0; n < 4; n++) {
      const date = addMonths(`${periodOf(today)}-${String(f.dayOfMonth).padStart(2, '0')}`, n);
      if (date >= today && date <= end) items.push({ date, label: name, cents: -cents, kind: 'fixed' });
    }
  }

  // Remaining installments of purchases in installments (the last one seen per purchase).
  const withInstallments = await prisma.expenseMovement.findMany({
    where: { tenantId, installment: { not: null }, kind: 'expense', direction: 'debit', date: { gte: new Date(new Date(`${today}T00:00:00Z`).getTime() - 62 * DAY) } },
    select: { date: true, installment: true, descriptionEnc: true, amountEnc: true, accountId: true },
    orderBy: { date: 'desc' },
  });
  const seen = new Set<string>();
  for (const m of withInstallments) {
    const [n, total] = m.installment!.split('/').map(Number);
    const label = decryptExpenseData(m.descriptionEnc);
    const key = `${m.accountId}:${label}:${total}`;
    if (seen.has(key) || !(n < total)) continue;
    seen.add(key);
    const cents = decryptAmountCents(m.amountEnc);
    for (let k = 1; k <= total - n; k++) {
      const date = addMonths(iso(m.date), k);
      if (date > end) break;
      if (date >= today) items.push({ date, label: `${label} (${String(n + k).padStart(2, '0')}/${String(total).padStart(2, '0')})`, cents: -cents, kind: 'installment' });
    }
  }

  // Recurring revenue from clients' products.
  let otherCurrencyLines = 0;
  if (tenant && isClientsAllowed(tenant)) {
    const lines = await prisma.companyProduct.findMany({
      where: { tenantId, cancelledAt: null, product: { billing: { in: ['monthly', 'yearly'] } } },
      select: { startDate: true, quantity: true, unitPriceCents: true, company: { select: { name: true } }, product: { select: { name: true, billing: true, currency: true } } },
    });
    for (const l of lines) {
      if (l.product.currency !== currency) {
        otherCurrencyLines++;
        continue;
      }
      const cents = l.unitPriceCents * l.quantity;
      const start = iso(l.startDate);
      const step = l.product.billing === 'yearly' ? 12 : 1;
      for (let k = 0; k < 40; k++) {
        const date = addMonths(start, k * step);
        if (date > end) break;
        if (date >= today) items.push({ date, label: `${l.company.name} · ${l.product.name}`, cents, kind: 'revenue' });
      }
    }
  }

  const weeks = weekBuckets(today, items, openingCents);
  return {
    currency,
    from: today,
    to: end,
    weeks,
    totalInCents: weeks.reduce((a, w) => a + w.inCents, 0),
    totalOutCents: weeks.reduce((a, w) => a + w.outCents, 0),
    negativeWeeks: weeks.filter((w) => (w.balanceCents !== null ? w.balanceCents < 0 : w.netCents < 0)).map((w) => w.start),
    otherCurrencyLines,
  };
}
