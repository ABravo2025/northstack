// Clientes C6 (spec-clientes-gastos-formularios.md): the client health score, pure and explained.
// Five parts, each 0-100, weighted into one 0-100 score:
//   satisfaction 30 — their NPS/CSAT answers in the last 180 days (surveys that count toward health)
//   contact      25 — how recently someone checked in, met or noted something with them
//   onboarding   15 — how far the hand-off project got
//   products     15 — active products, minus recent cancellations
//   support      15 — open and overdue tickets (C7); full marks while there are none
// A part with no data scores a neutral value, so a brand-new client isn't "critical" by default.

export type HealthPart = 'satisfaction' | 'contact' | 'onboarding' | 'products' | 'support';
export const HEALTH_WEIGHTS: Record<HealthPart, number> = { satisfaction: 30, contact: 25, onboarding: 15, products: 15, support: 15 };
const NEUTRAL = 70;

export type HealthStatus = 'healthy' | 'at_risk' | 'critical';

export interface HealthInput {
  surveyScores: { score: number; scale: 'nps' | 'csat' }[];
  daysSinceContact: number | null;
  lastSentiment: 'good' | 'neutral' | 'bad' | null;
  onboarding: { tasks: number; done: number; completed: boolean } | null;
  activeProducts: number;
  cancelledLast90: number;
  openTickets: number;
  overdueTickets: number;
}

export function satisfactionPart(scores: HealthInput['surveyScores']): number | null {
  if (!scores.length) return null;
  const normalized = scores.map((s) => (s.scale === 'nps' ? s.score * 10 : (s.score - 1) * 25));
  return Math.round(normalized.reduce((a, b) => a + b, 0) / normalized.length);
}

export function contactPart(days: number | null, sentiment: HealthInput['lastSentiment']): number | null {
  if (days === null) return null;
  const recency = days <= 30 ? 100 : days <= 60 ? 60 : days <= 90 ? 30 : 0;
  const mood = sentiment === 'bad' ? -30 : sentiment === 'good' ? 0 : sentiment === 'neutral' ? -10 : 0;
  return Math.max(0, recency + mood);
}

export function onboardingPart(o: HealthInput['onboarding']): number | null {
  if (!o) return null;
  if (o.completed) return 100;
  return o.tasks ? Math.round((o.done / o.tasks) * 100) : 50;
}

export function productsPart(active: number, cancelled: number): number | null {
  if (active === 0 && cancelled === 0) return null;
  if (active === 0) return 0;
  return Math.max(0, 100 - cancelled * 40);
}

export function supportPart(open: number, overdue: number): number {
  return Math.max(0, 100 - open * 10 - overdue * 25);
}

export function healthScore(input: HealthInput) {
  const raw: Record<HealthPart, number | null> = {
    satisfaction: satisfactionPart(input.surveyScores),
    contact: contactPart(input.daysSinceContact, input.lastSentiment),
    onboarding: onboardingPart(input.onboarding),
    products: productsPart(input.activeProducts, input.cancelledLast90),
    support: supportPart(input.openTickets, input.overdueTickets),
  };
  const parts = (Object.keys(HEALTH_WEIGHTS) as HealthPart[]).map((part) => ({
    part,
    weight: HEALTH_WEIGHTS[part],
    score: raw[part] ?? NEUTRAL,
    hasData: raw[part] !== null,
  }));
  const score = Math.round(parts.reduce((sum, p) => sum + (p.score * p.weight) / 100, 0));
  const status: HealthStatus = score >= 70 ? 'healthy' : score >= 40 ? 'at_risk' : 'critical';
  return { score, status, parts };
}

// The next check-in is suggested 30 days after the last one (sooner when it went badly).
export function suggestedNextCheckIn(at: Date, sentiment: HealthInput['lastSentiment']): Date {
  const days = sentiment === 'bad' ? 7 : sentiment === 'neutral' ? 21 : 30;
  return new Date(at.getTime() + days * 86_400_000);
}
