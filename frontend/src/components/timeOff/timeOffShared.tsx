import { useTranslation } from 'react-i18next';
import type { TimeOffBalance, TimeOffRequest } from '../../api';

// Shared bits of the 3 Time Off views (2026-10 redesign, see TimeOffOverviewPage.tsx).

export const FALLBACK_POLICY_COLOR = '#9ca3af';
export const policyColor = (color: string | null | undefined) => color || FALLBACK_POLICY_COLOR;

const round2 = (n: number) => Math.round(n * 100) / 100;

// The backend's `remaining` is allocated − used; days still in review haven't been subtracted
// yet. What a person can actually still ask for is remaining − pending.
export const availableDays = (b: TimeOffBalance) => round2(b.remaining - b.pending);

// Request dates come back as ISO timestamps at UTC midnight — reading only the date part (and
// pinning it to noon) keeps a "13 Oct" request from showing as "12 Oct" west of UTC.
export const toDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
export const isoDay = (iso: string) => iso.slice(0, 10);

// Mirrors countInclusiveDays() in timeOffRequestService.ts: calendar days, both ends included.
export function countRequestDays(start: string, end: string): number {
  if (!start || !end || end < start) return 0;
  return Math.round((toDate(end).getTime() - toDate(start).getTime()) / 86_400_000) + 1;
}

export function useDateRangeFormatter() {
  const { i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const thisYear = new Date().getFullYear();
  const day = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' });
  const dayYear = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' });
  const one = (iso: string) => {
    const d = toDate(iso);
    return (d.getFullYear() === thisYear ? day : dayYear).format(d);
  };
  return {
    day: one,
    long: (iso: string) => dayYear.format(toDate(iso)),
    range: (start: string, end: string) => (isoDay(start) === isoDay(end) ? one(start) : `${one(start)} – ${one(end)}`),
  };
}

export function BalanceMeter({ balance, color }: { balance: TimeOffBalance; color: string }) {
  const { t } = useTranslation('tasks');
  const total = Math.max(balance.allocated, balance.used + balance.pending, 1);
  return (
    <div
      className="to-meter"
      style={{ color }}
      role="img"
      aria-label={`${t('timeOff.mine.used', { count: balance.used })}, ${t('timeOff.mine.inReview', { count: balance.pending })}, ${availableDays(balance)} ${t('timeOff.mine.available')}`}
    >
      <span style={{ width: `${(balance.used / total) * 100}%`, background: color }} />
      <span className="to-meter-pending" style={{ width: `${(balance.pending / total) * 100}%` }} />
    </div>
  );
}

export function RequestStatusChip({ status }: { status: TimeOffRequest['status'] }) {
  const { t } = useTranslation('tasks');
  return <span className={`to-chip to-chip-${status}`}>{t(`timeOff.status.${status}`, { defaultValue: status })}</span>;
}

export function PolicyName({ name, color }: { name: string; color: string | null | undefined }) {
  return (
    <span className="to-policy-name">
      <span className="color-dot" style={{ background: policyColor(color) }} />
      {name}
    </span>
  );
}
