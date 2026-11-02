import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    companyProduct: { findMany: vi.fn() },
    opportunity: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
    company: { findMany: vi.fn(), findFirst: vi.fn() },
    formResponse: { findMany: vi.fn() },
    contact: { findMany: vi.fn() },
    pipeline: { findFirst: vi.fn() },
    tenant: { findUnique: vi.fn() },
  },
}));
vi.mock('../src/modules/crm/healthService.js', () => ({ computeHealth: vi.fn() }));
vi.mock('../src/modules/crm/opportunityService.js', () => ({ createOpportunity: vi.fn(async () => ({ id: 'o-new' })) }));

import prisma from '../src/lib/prisma.js';
import { computeHealth } from '../src/modules/crm/healthService.js';
import { createOpportunity } from '../src/modules/crm/opportunityService.js';
import { createSignalOpportunity, getSignals } from '../src/modules/crm/signalService.js';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const now = new Date('2026-11-02T00:00:00Z');
const line = (companyId: string, productId: string, renewalDate: Date | null = null) => ({
  companyId,
  productId,
  quantity: 1,
  unitPriceCents: 10000,
  renewalDate,
  product: { name: productId, billing: 'monthly', currency: 'USD' },
});

beforeEach(() => {
  vi.clearAllMocks();
  db.opportunity.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  db.product.findMany.mockResolvedValue([{ id: 'p1', name: 'Pro', unitPriceCents: 10000, currency: 'USD', billing: 'monthly' }, { id: 'p2', name: 'Analytics', unitPriceCents: 5000, currency: 'USD', billing: 'monthly' }]);
  db.company.findMany.mockResolvedValue([
    { id: 'happy', name: 'Happy SA', accountOwnerId: 'u1' },
    { id: 'renew', name: 'Renew SA', accountOwnerId: null },
    { id: 'sad', name: 'Sad SA', accountOwnerId: null },
  ]);
  db.formResponse.findMany.mockResolvedValue([]);
  db.contact.findMany.mockResolvedValue([]);
});

describe('client signals', () => {
  it('expansion for a healthy client with white space, renewal soon, risk for a critical one', async () => {
    db.companyProduct.findMany.mockResolvedValue([line('happy', 'p1'), line('renew', 'p1', new Date('2026-12-15T00:00:00Z')), line('sad', 'p1')]);
    vi.mocked(computeHealth).mockResolvedValue(
      new Map([
        ['happy', { score: 85, status: 'healthy' }],
        ['renew', { score: 60, status: 'at_risk' }],
        ['sad', { score: 20, status: 'critical' }],
      ]) as never,
    );
    const signals = await getSignals('t1', now);
    expect(signals.map((s) => [s.companyId, s.kind])).toEqual([
      ['sad', 'risk'],
      ['renew', 'renewal'],
      ['happy', 'expansion'],
    ]);
    expect(signals.find((s) => s.companyId === 'happy')!.products.map((p) => p.id)).toEqual(['p2']);
    expect(signals.find((s) => s.companyId === 'renew')!.renewalDate).toBe('2026-12-15');
  });

  it('no repeated signal when an expansion deal is already open', async () => {
    db.opportunity.findMany.mockReset();
    db.opportunity.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ companyId: 'happy', pipeline: { purpose: 'expansion' } }]);
    db.companyProduct.findMany.mockResolvedValue([line('happy', 'p1')]);
    db.company.findMany.mockResolvedValue([{ id: 'happy', name: 'Happy SA', accountOwnerId: 'u1' }]);
    vi.mocked(computeHealth).mockResolvedValue(new Map([['happy', { score: 85, status: 'healthy' }]]) as never);
    expect(await getSignals('t1', now)).toEqual([]);
  });

  it('opens the opportunity in the pipeline with that purpose, owned by the account owner', async () => {
    db.company.findFirst.mockResolvedValue({ id: 'happy', name: 'Happy SA', accountOwnerId: 'u-csm' });
    db.pipeline.findFirst.mockResolvedValue({ id: 'p-exp' });
    db.tenant.findUnique.mockResolvedValue({ currency: 'USD' });
    db.product.findMany.mockResolvedValue([{ id: 'p2', name: 'Analytics', unitPriceCents: 5000, currency: 'USD' }]);
    await createSignalOpportunity('t1', 'u1', { companyId: 'happy', kind: 'expansion', productIds: ['p2'] });
    expect(db.pipeline.findFirst.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', purpose: 'expansion' });
    expect(createOpportunity).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'happy', pipelineId: 'p-exp', amountCents: 5000, ownerId: 'u-csm' }), 'u1');
  });

  it('asks to create the pipeline when there is none with that purpose', async () => {
    db.company.findFirst.mockResolvedValue({ id: 'happy', name: 'Happy SA', accountOwnerId: null });
    db.pipeline.findFirst.mockResolvedValue(null);
    await expect(createSignalOpportunity('t1', 'u1', { companyId: 'happy', kind: 'renewal' })).rejects.toMatchObject({ code: 'no_pipeline' });
  });
});
