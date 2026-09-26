import { beforeEach, describe, expect, it, vi } from 'vitest';

let rows: any[] = [];
let nextId = 1;
const subscriptionUpdates: any[] = [];

function latest(where: any) {
  return (
    rows
      .filter(
        (r) =>
          (where.plan === undefined || r.plan === where.plan) &&
          r.market === where.market &&
          (where.extraSeatPriceCents === undefined || r.extraSeatPriceCents === where.extraSeatPriceCents) &&
          (where.dodoExtraSeatAddonId?.not !== null || r.dodoExtraSeatAddonId !== null),
      )
      .sort((a, b) => b.effectiveFrom - a.effectiveFrom)[0] ?? null
  );
}

vi.mock('../src/lib/prisma.js', () => {
  const mockPrisma: any = {
    planPrice: {
      findFirst: vi.fn(async ({ where }: any) => latest(where)),
      findUnique: vi.fn(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null),
      findUniqueOrThrow: vi.fn(async ({ where }: any) => rows.find((r) => r.id === where.id)),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `pp_${nextId}`, effectiveFrom: nextId, dodoProductId: null, dodoExtraSeatAddonId: null, ...data };
        nextId += 1;
        rows.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => Object.assign(rows.find((r) => r.id === where.id), data)),
    },
    subscription: {
      update: vi.fn(async (args: any) => subscriptionUpdates.push(args)),
    },
    $executeRaw: vi.fn(async () => 0),
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
  };
  return { default: mockPrisma };
});

const { createRecurringProductMock, createExtraSeatAddonMock, legacyAddonMock } = vi.hoisted(() => ({
  createRecurringProductMock: vi.fn(async () => 'pdt_new'),
  createExtraSeatAddonMock: vi.fn(async () => 'adn_new'),
  legacyAddonMock: vi.fn(async (): Promise<string | null> => null),
}));
vi.mock('../src/lib/dodopayments.js', () => ({
  createRecurringProduct: createRecurringProductMock,
  createExtraSeatAddon: createExtraSeatAddonMock,
  legacyExtraSeatAddonMatching: legacyAddonMock,
}));

const { PRICING } = await import('../src/config/pricing.js');
const intl = PRICING.markets.international;

// The service memoizes "already synced" per process — a fresh module per test.
async function load() {
  vi.resetModules();
  return import('../src/modules/tenant/planPriceService.js');
}

function row(overrides: Record<string, unknown>) {
  const r = { id: `pp_${nextId}`, effectiveFrom: nextId, currency: 'USD', extraSeatPriceCents: 0, dodoProductId: null, dodoExtraSeatAddonId: null, ...overrides };
  nextId += 1;
  rows.push(r);
  return r;
}

beforeEach(() => {
  rows = [];
  nextId = 1;
  subscriptionUpdates.length = 0;
  createRecurringProductMock.mockClear();
  createExtraSeatAddonMock.mockClear();
  legacyAddonMock.mockReset();
  legacyAddonMock.mockResolvedValue(null);
});

describe('ensurePlanPricesSynced', () => {
  it('seeds a row per plan per market from src/config/pricing.ts on an empty table', async () => {
    const { ensurePlanPricesSynced } = await load();
    await ensurePlanPricesSynced();

    expect(rows).toHaveLength(4);
    expect(rows).toContainEqual(
      expect.objectContaining({ plan: 'growth', market: 'international', currency: 'USD', launchPriceCents: intl.plans.growth, extraSeatPriceCents: intl.extraSeat }),
    );
    expect(rows).toContainEqual(expect.objectContaining({ plan: 'starter', market: 'ar', currency: 'ARS' }));
  });

  it('inserts nothing when the latest rows already match the config', async () => {
    const { ensurePlanPricesSynced } = await load();
    await ensurePlanPricesSynced();
    const { ensurePlanPricesSynced: again } = await load();
    await again();

    expect(rows).toHaveLength(4);
  });

  it('inserts a new row on a price change (history kept) and drops the Dodo product priced at the old amount', async () => {
    row({ plan: 'starter', market: 'international', launchPriceCents: 1500, extraSeatPriceCents: intl.extraSeat, dodoProductId: 'pdt_old', dodoExtraSeatAddonId: 'adn_seat' });
    const { ensurePlanPricesSynced } = await load();
    await ensurePlanPricesSynced();

    const starterRows = rows.filter((r) => r.plan === 'starter' && r.market === 'international');
    expect(starterRows).toHaveLength(2);
    const newest = starterRows.at(-1);
    expect(newest).toMatchObject({ launchPriceCents: intl.plans.starter, dodoProductId: null, dodoExtraSeatAddonId: 'adn_seat' });
  });

  it('keeps the Dodo product when only the seat price changed', async () => {
    row({ plan: 'growth', market: 'international', launchPriceCents: intl.plans.growth, extraSeatPriceCents: 0, dodoProductId: 'pdt_growth' });
    const { ensurePlanPricesSynced } = await load();
    await ensurePlanPricesSynced();

    const newest = rows.filter((r) => r.plan === 'growth' && r.market === 'international').at(-1);
    expect(newest).toMatchObject({ extraSeatPriceCents: intl.extraSeat, dodoProductId: 'pdt_growth', dodoExtraSeatAddonId: null });
  });
});

describe('currentPlanPrice', () => {
  it('returns null for a plan not sold in that market (0 in the config)', async () => {
    const { currentPlanPrice } = await load();
    const result = await currentPlanPrice('starter', 'ar');
    if (PRICING.markets.ar.plans.starter > 0) {
      expect(result).not.toBeNull();
    } else {
      expect(result).toBeNull();
    }
  });

  it('provisions the Dodo product and extra-seat addon for a new international row', async () => {
    const { currentPlanPrice } = await load();
    const result = await currentPlanPrice('starter', 'international');

    expect(createRecurringProductMock).toHaveBeenCalledWith({ name: 'Northstack — starter', priceCents: intl.plans.starter });
    expect(createExtraSeatAddonMock).toHaveBeenCalledWith(intl.extraSeat);
    expect(result).toMatchObject({ dodoProductId: 'pdt_new', dodoExtraSeatAddonId: 'adn_new' });
  });

  it('reuses the pre-2026-09-26 env addon when it has the same price, instead of creating another', async () => {
    legacyAddonMock.mockResolvedValue('adn_legacy');
    const { currentPlanPrice } = await load();
    const result = await currentPlanPrice('growth', 'international');

    expect(createExtraSeatAddonMock).not.toHaveBeenCalled();
    expect(result?.dodoExtraSeatAddonId).toBe('adn_legacy');
  });

  it("reuses the other plan's addon for the same seat price", async () => {
    const { currentPlanPrice } = await load();
    await currentPlanPrice('starter', 'international');
    await currentPlanPrice('growth', 'international');

    expect(createExtraSeatAddonMock).toHaveBeenCalledTimes(1);
  });
});

describe('lockedPlanPrice', () => {
  it("returns the subscription's pinned row even after the config moved on", async () => {
    const old = row({ plan: 'starter', market: 'international', launchPriceCents: 1500, dodoProductId: 'pdt_old' });
    const { lockedPlanPrice } = await load();

    const result = await lockedPlanPrice({ id: 's1', planPriceId: old.id, plan: 'starter', provider: 'dodopayments', lockedPriceCents: 1500 }, 'international');

    expect(result).toBe(old);
    expect(subscriptionUpdates).toHaveLength(0);
  });

  it('pins an unpinned, confirmed subscription to the current row when that is the price it pays', async () => {
    const { lockedPlanPrice } = await load();

    const result = await lockedPlanPrice(
      { id: 's1', planPriceId: null, plan: 'starter', provider: 'dodopayments', lockedPriceCents: intl.plans.starter },
      'international',
    );

    expect(subscriptionUpdates).toEqual([{ where: { id: 's1' }, data: { planPriceId: result!.id } }]);
  });

  it('does not pin a subscription paying a different (older) price', async () => {
    const { lockedPlanPrice } = await load();
    await lockedPlanPrice({ id: 's1', planPriceId: null, plan: 'starter', provider: 'dodopayments', lockedPriceCents: 2900 }, 'international');

    expect(subscriptionUpdates).toHaveLength(0);
  });
});

describe('mercadoPagoAmount', () => {
  it('is base + extra seats at the row\'s own seat price, in major units', async () => {
    const { mercadoPagoAmount } = await load();
    expect(mercadoPagoAmount({ launchPriceCents: 2_000_000, extraSeatPriceCents: 300_000 }, 2)).toBe(26_000);
  });
});
