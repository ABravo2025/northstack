import { useTranslation } from 'react-i18next';
import { CheckIcon } from './Icons';
import type { PricedPlan, PublicPlanLimits } from '../../api/types';

// Plans comparison grouped by module (2026-10-14 plan review, Alejandro). Every number comes from
// the backend's PLAN_LIMITS through GET /api/plans/prices (`pricing.limits`) — nothing here says
// "5 projects" on its own. Shown under the plan cards in PlansModal; the landing has its own copy
// of the same groups (landing/index.html, no Payments row there by decision).
//
// Not listed yet on purpose: clock-in (Shifts phase 2) and AI assistants (MCP) — add their rows
// when each one reaches production, not before (the comparison must only promise what's live).

type Value = boolean | number | null | 'text';

interface Row {
  key: string;
  value: (l: PublicPlanLimits) => Value;
  // How a number reads: "Up to 5" (default) or "7 days".
  unit?: 'upTo' | 'days';
  sub?: boolean;
}

const GROUPS: { key: string; rows: Row[] }[] = [
  {
    key: 'people',
    rows: [
      { key: 'profiles', value: () => true },
      { key: 'selfService', value: () => true },
      { key: 'customRoles', value: (l) => l.maxCustomRoles },
    ],
  },
  {
    key: 'timeOff',
    rows: [
      { key: 'policies', value: (l) => l.maxTimeOffPolicies },
      { key: 'holidays', value: () => true },
      { key: 'googleCalendar', value: () => true },
    ],
  },
  {
    key: 'sales',
    rows: [
      { key: 'pipelines', value: (l) => l.maxPipelines },
      { key: 'crmRecords', value: () => true },
      { key: 'formsCsv', value: () => true },
    ],
  },
  {
    key: 'projects',
    rows: [
      { key: 'activeProjects', value: (l) => l.maxActiveProjects, sub: true },
      { key: 'taskChat', value: () => true },
      { key: 'templates', value: (l) => l.customProjectTemplatesEnabled },
    ],
  },
  {
    key: 'shifts',
    rows: [
      { key: 'locations', value: (l) => l.maxActiveLocations },
      { key: 'scheduling', value: () => true },
      { key: 'timesheet', value: () => true },
      { key: 'skills', value: (l) => l.shiftSkillsEnabled },
      { key: 'billable', value: (l) => l.billableHoursEnabled },
    ],
  },
  {
    key: 'payroll',
    rows: [
      { key: 'payroll', value: (l) => l.payrollEnabled, sub: true },
      { key: 'payments', value: (l) => l.paymentsEnabled },
    ],
  },
  {
    key: 'integrations',
    rows: [{ key: 'api', value: (l) => l.apiAccessEnabled }],
  },
  {
    key: 'control',
    rows: [
      { key: 'activityLog', value: (l) => l.activityLogRetentionDays, unit: 'days' },
      { key: 'support', value: () => 'text' },
    ],
  },
];

const PLANS: PricedPlan[] = ['starter', 'growth'];

export default function PlansComparison({ limits }: { limits: Record<PricedPlan, PublicPlanLimits> }) {
  const { t } = useTranslation('settingsPages');

  const cell = (row: Row, plan: PricedPlan) => {
    const v = row.value(limits[plan]);
    if (v === 'text') return <span className="font-medium">{t(`plansModal.compare.rows.${row.key}.${plan}`)}</span>;
    if (v === true) {
      return (
        <span role="img" aria-label={t('plansModal.compare.included')} className="inline-flex">
          <CheckIcon className="h-4 w-4 text-accent dark:text-brand-blue-light" />
        </span>
      );
    }
    if (v === false) return <span aria-label={t('plansModal.compare.notIncluded')} className="text-ink-faint dark:text-dark-ink-faint">—</span>;
    // Per-row word when the language needs agreement (ES: "Ilimitados" / "Ilimitadas").
    if (v === null) {
      return <span className="font-medium">{t(`plansModal.compare.rows.${row.key}.unlimited`, { defaultValue: t('plansModal.compare.unlimited') })}</span>;
    }
    return (
      <span className="font-medium tabular-nums">
        {row.unit === 'days' ? t('plansModal.compare.days', { count: v }) : t('plansModal.compare.upTo', { count: v })}
      </span>
    );
  };

  return (
    <div className="mt-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
        <h3 className="card-title">{t('plansModal.compare.title')}</h3>
        <span className="text-xs text-ink-faint dark:text-dark-ink-faint">{t('plansModal.compare.trialNote')}</span>
      </div>
      <div className="full-table-wrap">
        <table className="table full-table">
          <thead>
            <tr>
              <th>{t('plansModal.compare.feature')}</th>
              {/* Inline: the global `.table th` rule left-aligns headers and outranks a utility class on main. */}
              <th className="w-1/5" style={{ textAlign: 'center' }}>Starter</th>
              <th className="w-1/5" style={{ textAlign: 'center' }}>Growth</th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((group) => [
              <tr key={group.key} className="bg-surface-2 dark:bg-dark-raised">
                <td colSpan={3} className="text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-ink-muted">
                  {t(`plansModal.compare.groups.${group.key}`)}
                </td>
              </tr>,
              ...group.rows.map((row) => (
                <tr key={`${group.key}.${row.key}`}>
                  <td>
                    {t(`plansModal.compare.rows.${row.key}.label`)}
                    {row.sub && (
                      <span className="block text-xs text-ink-faint dark:text-dark-ink-faint">{t(`plansModal.compare.rows.${row.key}.sub`)}</span>
                    )}
                  </td>
                  {PLANS.map((plan) => (
                    <td key={plan} style={{ textAlign: 'center' }}>
                      {cell(row, plan)}
                    </td>
                  ))}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}
