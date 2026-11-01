// Gastos / Expenses — the pure rules (no database), so they're testable on their own:
// when a fixed expense is charged, what state it's in for a month, how a learned category rule
// matches, and how a month's movements add up. Amounts are integer cents throughout.

export type FixedPaymentMethod = 'auto_debit' | 'card' | 'manual';
export type FixedStatus = 'paid' | 'estimated' | 'scheduled' | 'due' | 'overdue';

// "YYYY-MM" for a "YYYY-MM-DD" date.
export function periodOf(date: string): string {
  return date.slice(0, 7);
}

export function isPeriod(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function previousPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function periodBounds(period: string): { from: string; to: string } {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` };
}

// The day a fixed expense is charged in a month: a 31 in a 30-day month (or February) is charged
// on the month's last day.
export function chargeDate(period: string, dayOfMonth: number): string {
  const last = Number(periodBounds(period).to.slice(8));
  return `${period}-${String(Math.min(Math.max(dayOfMonth, 1), last)).padStart(2, '0')}`;
}

// Where a fixed expense stands for a month. `booked` is the movement that pays it, if any.
// Auto debit / card: "scheduled" until its day, then the daily job books it as estimated, and a
// CSV import confirms it (paid). Manual payment: "due" from 5 days before its day, "overdue" after.
export function fixedStatus(
  method: FixedPaymentMethod,
  period: string,
  dayOfMonth: number,
  today: string,
  booked: { isEstimated: boolean } | null,
): FixedStatus {
  if (booked) return booked.isEstimated ? 'estimated' : 'paid';
  const charge = chargeDate(period, dayOfMonth);
  if (method !== 'manual') return 'scheduled';
  if (today > charge) return 'overdue';
  const soon = new Date(`${charge}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() - 5);
  return today >= soon.toISOString().slice(0, 10) ? 'due' : 'scheduled';
}

// A learned rule's pattern from the description a user re-categorised: upper case, no digits or
// card/transaction noise, the first words only — "MERPAGO*UBER TRIP 4821 BSAS" → "MERPAGO UBER TRIP".
export function rulePatternFrom(description: string): string {
  return description
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 3)
    .join(' ');
}

export function ruleMatches(pattern: string, description: string): boolean {
  if (!pattern) return false;
  const words = pattern.split(' ');
  const target = ` ${rulePatternSource(description)} `;
  return words.every((w) => target.includes(` ${w} `));
}

function rulePatternSource(description: string): string {
  return description
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SummableMovement {
  amountCents: number;
  direction: 'debit' | 'credit';
  kind: 'expense' | 'credit' | 'internal';
  categoryId: string | null;
  fixedExpenseId: string | null;
}

// What a set of movements adds up to as company spending. Internal transfers (a card payment from
// the bank) never count — the spending already counted on the card. A refund booked as an
// expense-kind credit lowers its category.
export function sumSpending(movements: SummableMovement[]) {
  let total = 0;
  let fixed = 0;
  let credits = 0;
  const byCategory = new Map<string | null, number>();
  for (const m of movements) {
    if (m.kind === 'internal') continue;
    if (m.kind === 'credit') {
      credits += m.amountCents;
      continue;
    }
    const signed = m.direction === 'debit' ? m.amountCents : -m.amountCents;
    total += signed;
    if (m.fixedExpenseId) fixed += signed;
    byCategory.set(m.categoryId, (byCategory.get(m.categoryId) ?? 0) + signed);
  }
  return { total, fixed, variable: total - fixed, credits, byCategory };
}

// Parses an amount typed in either convention ("12.500,50", "12,500.50", "12500.5", "12500") into
// integer cents. Null when it isn't a positive amount.
export function parseAmountToCents(input: unknown): number | null {
  if (typeof input === 'number') {
    return Number.isFinite(input) && input > 0 ? Math.round(input * 100) : null;
  }
  if (typeof input !== 'string') return null;
  let s = input.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Whichever separator comes last is the decimal one.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // A lone comma followed by 1-2 digits is decimal ("12,5"); otherwise thousands ("12,500").
    s = /,\d{1,2}$/.test(s) && s.split(',').length === 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot > -1 && !(/\.\d{1,2}$/.test(s) && s.split('.').length === 2)) {
    s = s.replace(/\./g, '');
  }
  const value = Number(s);
  if (!Number.isFinite(value) || value <= 0) return null;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}
