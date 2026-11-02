import type { LeadInboxStatus } from '@prisma/client';

// Clientes C2 — the Leads inbox rules, pure: the 5-touch cadence, the 4 qualification questions
// and the 0-100 score. Explained on screen, so they stay simple.

// Days after the lead arrived for each touch: same day, then 2, 5, 9 and 14 days in.
export const CADENCE_DAYS = [0, 2, 5, 9, 14] as const;
export const CADENCE_TOUCHES = CADENCE_DAYS.length;

export const QUALIFICATION_KEYS = ['need', 'budget', 'authority', 'timing'] as const;
export type QualificationKey = (typeof QUALIFICATION_KEYS)[number];
export type Qualification = Partial<Record<QualificationKey, boolean | null>>;

// Convert opens with 3 of the 4 questions answered "yes".
export const QUALIFIED_AT = 3;

export const TOUCH_CHANNELS = ['call', 'email', 'whatsapp', 'linkedin', 'meeting', 'other'] as const;
export const TOUCH_OUTCOMES = ['no_answer', 'replied', 'meeting_booked', 'not_interested'] as const;

export function readQualification(value: unknown): Qualification {
  const out: Qualification = {};
  if (!value || typeof value !== 'object') return out;
  for (const k of QUALIFICATION_KEYS) {
    const v = (value as Record<string, unknown>)[k];
    if (v === true || v === false || v === null) out[k] = v;
  }
  return out;
}

export function qualifiedCount(q: Qualification): number {
  return QUALIFICATION_KEYS.filter((k) => q[k] === true).length;
}

export function canConvert(q: Qualification): boolean {
  return qualifiedCount(q) >= QUALIFIED_AT;
}

// 20 per qualification "yes", +10 once the lead answered a touch, +10 if they came in on their own
// (a form). Capped at 100.
export function leadScore(input: { qualification: Qualification; repliedTouch: boolean; inbound: boolean }): number {
  const score = qualifiedCount(input.qualification) * 20 + (input.repliedTouch ? 10 : 0) + (input.inbound ? 10 : 0);
  return Math.min(100, score);
}

// When the next touch of the cadence is due, or null once all five are done.
export function nextTouchAt(createdAt: Date, touchCount: number): Date | null {
  if (touchCount >= CADENCE_TOUCHES) return null;
  return new Date(createdAt.getTime() + CADENCE_DAYS[touchCount] * 86_400_000);
}

// The inbox status follows the work, until the lead is converted or disqualified.
export function leadStatusFor(current: LeadInboxStatus, touchCount: number, q: Qualification): LeadInboxStatus {
  if (current === 'converted' || current === 'disqualified') return current;
  if (canConvert(q)) return 'qualified';
  return touchCount > 0 ? 'working' : 'new';
}
