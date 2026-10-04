import prisma from '../../lib/prisma.js';
import { listClients } from './adminClientService.js';

// Admin Center v2, stage 3 (2026-10-04): the Billing page — everything Northstack charged, across
// both providers (Dodo in USD, Mercado Pago in ARS), from what's already stored (Invoice rows the
// webhooks write, Subscription state). Read-only, no provider calls.

const DAY = 24 * 60 * 60 * 1000;

export interface BillingRange {
  from: Date;
  to: Date; // exclusive
}

// "2026-10" → that calendar month (UTC). Anything else → the current month.
export function monthRange(month: string | undefined, now: Date = new Date()): BillingRange {
  const m = /^(\d{4})-(\d{2})$/.exec(month ?? '');
  const year = m ? Number(m[1]) : now.getUTCFullYear();
  const mon = m ? Number(m[2]) - 1 : now.getUTCMonth();
  return { from: new Date(Date.UTC(year, mon, 1)), to: new Date(Date.UTC(year, mon + 1, 1)) };
}

type Totals = Record<string, { paid: number; failed: number; refunded: number; count: number }>;

export function totalsByCurrency(invoices: { amountCents: number; currency: string; status: string }[]): Totals {
  const out: Totals = {};
  for (const inv of invoices) {
    const t = (out[inv.currency] ??= { paid: 0, failed: 0, refunded: 0, count: 0 });
    t.count++;
    if (inv.status === 'paid') t.paid += inv.amountCents;
    else if (inv.status === 'failed') t.failed += inv.amountCents;
    else if (inv.status === 'refunded') t.refunded += inv.amountCents;
  }
  return out;
}

export async function getBillingOverview(month: string | undefined, now: Date = new Date()) {
  const range = monthRange(month, now);
  const sixMonthsBack = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth() - 5, 1));

  const [invoices, history, clients] = await Promise.all([
    prisma.invoice.findMany({
      where: { createdAt: { gte: range.from, lt: range.to } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, amountCents: true, currency: true, status: true, provider: true, paidAt: true, createdAt: true, periodStart: true, periodEnd: true,
        subscription: { select: { tenant: { select: { id: true, name: true } } } },
      },
    }),
    prisma.invoice.findMany({
      where: { createdAt: { gte: sixMonthsBack, lt: range.to }, status: 'paid' },
      select: { amountCents: true, currency: true, createdAt: true },
    }),
    listClients(now),
  ]);

  // Paid per month and currency, the 6 months ending with the selected one.
  const months = Array.from({ length: 6 }, (_, i) => {
    const start = new Date(Date.UTC(sixMonthsBack.getUTCFullYear(), sixMonthsBack.getUTCMonth() + i, 1));
    return start.toISOString().slice(0, 7);
  });
  const byMonth: Record<string, Record<string, number>> = Object.fromEntries(months.map((m) => [m, {}]));
  for (const inv of history) {
    const key = inv.createdAt.toISOString().slice(0, 7);
    if (byMonth[key]) byMonth[key][inv.currency] = (byMonth[key][inv.currency] ?? 0) + inv.amountCents;
  }

  const mrrByCurrency: Record<string, number> = {};
  for (const c of clients) if (c.mrrCents > 0) mrrByCurrency[c.currency] = (mrrByCurrency[c.currency] ?? 0) + c.mrrCents;

  const in30 = new Date(now.getTime() + 30 * DAY);
  const upcoming = clients
    .filter((c) => c.nextChargeAt && c.mrrCents > 0 && c.status === 'active' && c.nextChargeAt <= in30)
    .sort((a, b) => a.nextChargeAt!.getTime() - b.nextChargeAt!.getTime())
    .map((c) => ({ id: c.id, name: c.name, at: c.nextChargeAt, amountCents: c.mrrCents, currency: c.currency }));

  const subs = await prisma.subscription.findMany({
    where: { cancelledAt: { not: null }, status: { in: ['active', 'past_due'] } },
    select: { cancelledAt: true, cancellationEffectiveAt: true, cancellationReason: true, tenant: { select: { id: true, name: true } } },
    orderBy: { cancellationEffectiveAt: 'asc' },
  });

  return {
    month: range.from.toISOString().slice(0, 7),
    totals: totalsByCurrency(invoices),
    mrrByCurrency,
    payingClients: clients.filter((c) => c.mrrCents > 0).length,
    pastDue: clients.filter((c) => c.status === 'past_due').map((c) => ({ id: c.id, name: c.name, amountCents: c.mrrCents, currency: c.currency })),
    cancellations: subs.map((s) => ({ id: s.tenant.id, name: s.tenant.name, requestedAt: s.cancelledAt, effectiveAt: s.cancellationEffectiveAt, reason: s.cancellationReason })),
    upcoming,
    monthly: months.map((m) => ({ month: m, paid: byMonth[m] })),
    invoices: invoices.map((inv) => ({
      id: inv.id,
      tenant: inv.subscription.tenant,
      amountCents: inv.amountCents,
      currency: inv.currency,
      status: inv.status,
      provider: inv.provider,
      at: inv.paidAt ?? inv.createdAt,
      periodStart: inv.periodStart,
      periodEnd: inv.periodEnd,
    })),
  };
}
