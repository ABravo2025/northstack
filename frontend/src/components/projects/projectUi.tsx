import { useTranslation } from 'react-i18next';
import StatusChip from '../common/StatusChip';
import type { ProjectStatus } from '../../api/projects';
import { toLocalCalendarDate } from '../../lib/taskHubDates';

// Small shared pieces of the Projects module (list + detail).

export const PROJECT_STATUS_COLOR: Record<ProjectStatus, string> = {
  planning: '#8f8aa8',
  active: '#5b21e6',
  on_hold: '#d97706',
  completed: '#059669',
  cancelled: '#dc2626',
};

export function ProjectStatusChip({ status }: { status: ProjectStatus }) {
  const { t } = useTranslation('projects');
  return <StatusChip color={PROJECT_STATUS_COLOR[status]} label={t(`status.${status}`)} />;
}

export function ProgressBar({ done, total, label }: { done: number; total: number; label?: string }) {
  const pct = total ? Math.round((done * 100) / total) : 0;
  const complete = total > 0 && done === total;
  return (
    <div className="flex min-w-[110px] items-center gap-2" title={label}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-line dark:bg-dark-line"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={`h-full rounded-full ${complete ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-ink-muted dark:text-dark-ink-muted">{pct}%</span>
    </div>
  );
}

// Project start/end are calendar dates (UTC midnight); task due dates are either that or a real
// instant — toLocalCalendarDate handles both without shifting the day west of UTC.
export function useProjectDateFormat() {
  const { i18n } = useTranslation();
  const locale = i18n.language === 'es' ? 'es-AR' : 'en-US';
  return (iso: string | null | undefined, withYear = false) =>
    iso ? toLocalCalendarDate(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }) : '—';
}

export function isPastDue(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return toLocalCalendarDate(iso).getTime() < today.getTime();
}

// <input type="date"> value from a stored date (and back).
export function toDateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}
