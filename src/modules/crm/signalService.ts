import prisma from '../../lib/prisma.js';
import { computeHealth } from './healthService.js';
import { monthlyCents } from './productService.js';
import { createOpportunity } from './opportunityService.js';

// Clientes C8 (spec-clientes-gastos-formularios.md): upsell and renewal signals, computed from what's
// already there — health (C6), products and white space (C4), survey scores, renewal dates — and one
// click to open the opportunity in the Expansion or Renewals pipeline (C1 purpose).
//   expansion: a healthy client (or a promoter) with catalog products it doesn't have yet
//   renewal:   a product renewing in the next 90 days
//   risk:      a critical client, or a recent detractor — flagged on its renewal too

export type SignalKind = 'expansion' | 'renewal' | 'risk';
export type SignalReason = 'healthy' | 'promoter' | 'white_space' | 'renews_soon' | 'critical' | 'detractor';

export class SignalError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string,
  ) {
    super(message);
  }
}

const DAY = 86_400_000;

export async function getSignals(tenantId: string, now = new Date()) {
  // Clients = companies with an active product or a won deal.
  const [lines, wonDeals, catalog] = await Promise.all([
    prisma.companyProduct.findMany({
      where: { tenantId, cancelledAt: null },
      select: { companyId: true, productId: true, quantity: true, unitPriceCents: true, renewalDate: true, product: { select: { name: true, billing: true, currency: true } } },
    }),
    prisma.opportunity.findMany({ where: { tenantId, isActive: true, stage: { outcome: 'won' } }, select: { companyId: true } }),
    prisma.product.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true, unitPriceCents: true, currency: true, billing: true } }),
  ]);
  const companyIds = [...new Set([...lines.map((l) => l.companyId), ...wonDeals.map((d) => d.companyId)])];
  if (!companyIds.length) return [];

  const since90 = new Date(now.getTime() - 90 * DAY);
  const [companies, health, openDeals, responses] = await Promise.all([
    prisma.company.findMany({ where: { tenantId, id: { in: companyIds } }, select: { id: true, name: true, accountOwnerId: true } }),
    computeHealth(tenantId, companyIds, now),
    // A company that already has an open expansion / renewal deal doesn't get the same signal twice.
    prisma.opportunity.findMany({
      where: { tenantId, companyId: { in: companyIds }, isActive: true, stage: { outcome: 'open' }, pipeline: { purpose: { in: ['expansion', 'renewal'] } } },
      select: { companyId: true, pipeline: { select: { purpose: true } } },
    }),
    prisma.formResponse.findMany({
      where: { tenantId, linkedEntityType: 'contact', score: { not: null }, createdAt: { gte: since90 }, form: { kind: 'survey', module: 'clients' } },
      select: { linkedEntityId: true, score: true, form: { select: { surveySettings: true } } },
    }),
  ]);
  const contacts = responses.length
    ? await prisma.contact.findMany({ where: { tenantId, id: { in: responses.map((r) => r.linkedEntityId!) } }, select: { id: true, companyId: true } })
    : [];
  const contactCompany = new Map(contacts.map((c) => [c.id, c.companyId]));
  const npsBy = new Map<string, number[]>();
  for (const r of responses) {
    if ((r.form.surveySettings as { metric?: string } | null)?.metric === 'csat') continue;
    const companyId = contactCompany.get(r.linkedEntityId!);
    if (companyId) npsBy.set(companyId, [...(npsBy.get(companyId) ?? []), r.score!]);
  }

  const signals: {
    companyId: string;
    companyName: string;
    accountOwnerId: string | null;
    kind: SignalKind;
    reasons: SignalReason[];
    healthScore: number;
    healthStatus: string;
    mrr: { currency: string; cents: number }[];
    products: { id: string; name: string; amountCents: number; currency: string }[];
    renewalDate: string | null;
  }[] = [];

  for (const c of companies) {
    const h = health.get(c.id)!;
    const own = lines.filter((l) => l.companyId === c.id);
    const mrrMap = new Map<string, number>();
    for (const l of own) mrrMap.set(l.product.currency, (mrrMap.get(l.product.currency) ?? 0) + monthlyCents({ billing: l.product.billing, unitPriceCents: l.unitPriceCents, quantity: l.quantity }));
    const mrr = [...mrrMap.entries()].map(([currency, cents]) => ({ currency, cents }));
    const scores = npsBy.get(c.id) ?? [];
    const promoter = scores.some((s) => s >= 9);
    const detractor = scores.some((s) => s <= 6);
    const open = new Set(openDeals.filter((d) => d.companyId === c.id).map((d) => d.pipeline.purpose));
    const base = { companyId: c.id, companyName: c.name, accountOwnerId: c.accountOwnerId, healthScore: h.score, healthStatus: h.status, mrr };

    const ownedIds = new Set(own.map((l) => l.productId));
    const whiteSpace = catalog.filter((p) => !ownedIds.has(p.id));
    if (!open.has('expansion') && whiteSpace.length && (h.status === 'healthy' || promoter) && !detractor) {
      signals.push({
        ...base,
        kind: 'expansion',
        reasons: [h.status === 'healthy' ? 'healthy' : null, promoter ? 'promoter' : null, 'white_space'].filter(Boolean) as SignalReason[],
        products: whiteSpace.slice(0, 5).map((p) => ({ id: p.id, name: p.name, amountCents: p.unitPriceCents, currency: p.currency })),
        renewalDate: null,
      });
    }

    const renewing = own.filter((l) => l.renewalDate && l.renewalDate.getTime() - now.getTime() <= 90 * DAY && l.renewalDate.getTime() >= now.getTime() - 7 * DAY);
    const atRisk = h.status === 'critical' || detractor;
    if (renewing.length && !open.has('renewal')) {
      const first = renewing.sort((a, b) => a.renewalDate!.getTime() - b.renewalDate!.getTime())[0];
      signals.push({
        ...base,
        kind: atRisk ? 'risk' : 'renewal',
        reasons: ['renews_soon', ...(h.status === 'critical' ? (['critical'] as const) : []), ...(detractor ? (['detractor'] as const) : [])],
        products: renewing.map((l) => ({ id: l.productId, name: l.product.name, amountCents: l.unitPriceCents * l.quantity, currency: l.product.currency })),
        renewalDate: first.renewalDate!.toISOString().slice(0, 10),
      });
    } else if (atRisk && !renewing.length) {
      signals.push({ ...base, kind: 'risk', reasons: [h.status === 'critical' ? 'critical' : null, detractor ? 'detractor' : null].filter(Boolean) as SignalReason[], products: [], renewalDate: null });
    }
  }
  const order: Record<SignalKind, number> = { risk: 0, renewal: 1, expansion: 2 };
  return signals.sort((a, b) => order[a.kind] - order[b.kind] || (a.renewalDate ?? '9').localeCompare(b.renewalDate ?? '9') || b.healthScore - a.healthScore);
}

// One click from a signal: the opportunity in the first active pipeline with that purpose.
export async function createSignalOpportunity(
  tenantId: string,
  userId: string,
  input: { companyId: string; kind: 'expansion' | 'renewal'; productIds?: string[] },
) {
  const company = await prisma.company.findFirst({ where: { id: input.companyId, tenantId }, select: { id: true, name: true, accountOwnerId: true } });
  if (!company) throw new SignalError('Company not found', 404);
  const pipeline = await prisma.pipeline.findFirst({ where: { tenantId, isActive: true, purpose: input.kind }, orderBy: { order: 'asc' } });
  if (!pipeline) throw new SignalError('Create an Expansion or Renewals pipeline first (Settings → Pipelines → templates)', 409, 'no_pipeline');

  let amountCents = 0;
  let currency = (await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } }))?.currency ?? 'USD';
  const names: string[] = [];
  if (input.productIds?.length) {
    if (input.kind === 'renewal') {
      const renewing = await prisma.companyProduct.findMany({
        where: { tenantId, companyId: company.id, productId: { in: input.productIds }, cancelledAt: null },
        include: { product: { select: { name: true, currency: true } } },
      });
      for (const l of renewing) {
        amountCents += l.unitPriceCents * l.quantity;
        currency = l.product.currency;
        names.push(l.product.name);
      }
    } else {
      const products = await prisma.product.findMany({ where: { tenantId, id: { in: input.productIds } } });
      for (const p of products) {
        amountCents += p.unitPriceCents;
        currency = p.currency;
        names.push(p.name);
      }
    }
  }
  const label = input.kind === 'renewal' ? 'Renovación' : 'Expansión';
  const opportunity = await createOpportunity(
    {
      tenantId,
      companyId: company.id,
      pipelineId: pipeline.id,
      name: `${label} · ${company.name}${names.length ? ` · ${names.join(', ')}` : ''}`.slice(0, 200),
      amountCents,
      currency,
      ownerId: company.accountOwnerId ?? userId,
    },
    userId,
  );
  return { opportunityId: opportunity.id, pipelineId: pipeline.id };
}
