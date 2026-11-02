import { describe, expect, it } from 'vitest';
import { contactPart, healthScore, productsPart, satisfactionPart, suggestedNextCheckIn } from '../src/modules/crm/healthLogic.js';

const base = {
  surveyScores: [],
  daysSinceContact: null,
  lastSentiment: null,
  onboarding: null,
  activeProducts: 0,
  cancelledLast90: 0,
  openTickets: 0,
  overdueTickets: 0,
};

describe('health score', () => {
  it('a brand-new client with no data is neutral, not critical', () => {
    const r = healthScore(base);
    expect(r.status).toBe('healthy');
    expect(r.parts.filter((p) => p.hasData).map((p) => p.part)).toEqual(['support']);
  });

  it('normalizes NPS (0-10) and CSAT (1-5) to 0-100', () => {
    expect(satisfactionPart([{ score: 9, scale: 'nps' }, { score: 5, scale: 'csat' }])).toBe(95);
    expect(satisfactionPart([])).toBeNull();
  });

  it('recent contact counts, a bad check-in pulls it down', () => {
    expect(contactPart(10, 'good')).toBe(100);
    expect(contactPart(10, 'bad')).toBe(70);
    expect(contactPart(120, null)).toBe(0);
  });

  it('cancellations hurt; no products left is zero', () => {
    expect(productsPart(2, 1)).toBe(60);
    expect(productsPart(0, 1)).toBe(0);
    expect(productsPart(0, 0)).toBeNull();
  });

  it('an unhappy, silent client with overdue tickets is critical', () => {
    const r = healthScore({ ...base, surveyScores: [{ score: 2, scale: 'nps' }], daysSinceContact: 100, lastSentiment: 'bad', activeProducts: 1, cancelledLast90: 2, openTickets: 3, overdueTickets: 2 });
    expect(r.status).toBe('critical');
    expect(r.score).toBeLessThan(40);
  });

  it('suggests the next check-in sooner when it went badly', () => {
    const at = new Date('2026-11-02T00:00:00Z');
    expect(suggestedNextCheckIn(at, 'bad').toISOString().slice(0, 10)).toBe('2026-11-09');
    expect(suggestedNextCheckIn(at, 'good').toISOString().slice(0, 10)).toBe('2026-12-02');
  });
});
