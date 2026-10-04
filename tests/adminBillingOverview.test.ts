import { describe, expect, it } from 'vitest';
import { monthRange, totalsByCurrency } from '../src/modules/platform/adminBillingService.js';

describe('monthRange', () => {
  it('covers the whole calendar month, end exclusive', () => {
    const r = monthRange('2026-02');
    expect(r.from.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });
  it('rolls over the year and falls back to the current month on bad input', () => {
    expect(monthRange('2026-12').to.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(monthRange('hola', new Date('2026-10-04T12:00:00Z')).from.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe('totalsByCurrency', () => {
  it('never mixes currencies and splits paid / failed / refunded', () => {
    const t = totalsByCurrency([
      { amountCents: 1200, currency: 'USD', status: 'paid' },
      { amountCents: 1800, currency: 'USD', status: 'failed' },
      { amountCents: 2700000, currency: 'ARS', status: 'paid' },
      { amountCents: 900000, currency: 'ARS', status: 'refunded' },
    ]);
    expect(t.USD).toEqual({ paid: 1200, failed: 1800, refunded: 0, count: 2 });
    expect(t.ARS).toEqual({ paid: 2700000, failed: 0, refunded: 900000, count: 2 });
  });
});
