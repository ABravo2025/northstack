import prisma from './prisma.js';

// Notification preferences (spec-shifts.md Unidad 13; Alejandro, 2026-08-25: "un area en el
// perfil, de las notificaciones que desea recibir el usuario, asi no lo acosamos"). Each optional
// email belongs to one category; a person can turn categories off in Settings → Profile. The bell
// (in-app notifications) is never affected, and emails about the account itself (invitations,
// passwords, billing, legal, contracts, payouts) are not optional and have no category.
export const EMAIL_CATEGORIES = [
  'shifts', // new, changed or cancelled shifts
  'shiftReminders', // tomorrow's shifts, shifts waiting for an answer
  'shiftDeclined', // to schedulers: someone can't make a shift
  'skillsExpiring',
  'timesheet', // a week sent back or reopened, yesterday's hours not logged
  'timeOff', // requests to decide, decisions on yours
  'opportunityStage', // a deal moved stage
  'opportunityStalled', // a deal hasn't moved in a while
] as const;

export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export function isEmailCategory(value: unknown): value is EmailCategory {
  return typeof value === 'string' && (EMAIL_CATEGORIES as readonly string[]).includes(value);
}

// Validates a PATCH body: { [category]: boolean } → the new opt-out list (unknown keys rejected).
export function applyEmailPreferences(current: string[], input: unknown): { ok: true; value: string[] } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Expected an object of category: true/false' };
  const out = new Set(current.filter(isEmailCategory));
  for (const [key, on] of Object.entries(input)) {
    if (!isEmailCategory(key)) return { ok: false, error: `Unknown email category: ${key}` };
    if (typeof on !== 'boolean') return { ok: false, error: `${key} must be true or false` };
    if (on) out.delete(key);
    else out.add(key);
  }
  return { ok: true, value: EMAIL_CATEGORIES.filter((c) => out.has(c)) };
}

// Whether `to` wants this category. Someone who isn't a Northstack user (a client contact, say)
// has no preferences, so the email goes out. Fails open: a lookup error never drops an email.
export async function emailAllowed(to: string, category: EmailCategory): Promise<boolean> {
  try {
    const user = await prisma.user.findFirst({ where: { email: { equals: to.trim(), mode: 'insensitive' } }, select: { emailOptOuts: true } });
    return !user || !user.emailOptOuts.includes(category);
  } catch (err) {
    console.error('emailAllowed failed, sending anyway:', err);
    return true;
  }
}

export function emailPreferencesUrl(): string {
  return `${process.env.APP_BASE_URL ?? 'http://localhost:5173'}/settings/profile#email-notifications`;
}
