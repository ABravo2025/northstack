import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { PayrollOverview } from '../../api';
import TableBody from '../../components/common/TableBody';
import PayrollCostSection from '../../components/payroll/PayrollCostSection';
import TableSkeleton from '../../components/common/TableSkeleton';
import { BriefcaseIcon, CheckIcon } from '../../components/common/Icons';
import { useToast } from '../../components/common/ToastProvider';
import { formatMoney, formatNumber } from '../../lib/currencies';
import { personTaxIdKind } from '../../lib/taxId';
import { currentTenantCountry } from '../../lib/countries';

// Payroll v2 (spec-payroll-v2.md, unit 2): the Payroll overview, for whoever runs payroll — the
// latest pay run in numbers (one figure per currency), what's blocking the next close, recent runs.
export default function PayrollOverviewPage({ token }: { token: string }) {
  const { t, i18n } = useTranslation('hr');
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<PayrollOverview | null>(null);

  useEffect(() => {
    api
      .getPayrollOverview(token)
      .then(setData)
      .catch((e) => toast.error((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const num = (n: number) => formatNumber(n);
  const totals = (tt: Record<string, number>) =>
    Object.keys(tt).length ? Object.entries(tt).sort((a, b) => b[1] - a[1]).map(([c, v]) => formatMoney(v, c)).join(' + ') : '—';
  const day = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  if (!data) return <div className="container"><TableSkeleton /></div>;
  const p = data.pending;
  const pendingCount = p.unapprovedWeeks.length + p.unconfirmedContracts.length + (p.missingTaxIds?.length ?? 0) + p.staleDrafts.length + p.missingHours.length;
  const taxIdLabel = t(`common:taxId.label.${personTaxIdKind(currentTenantCountry())}`);
  const last = data.lastRun;

  return (
    <div className="container sh-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="to-title">{t('payroll.overview.title')}</h2>
          <p className="to-subtitle">{t('payroll.overview.subtitle', { count: data.inPayroll })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={() => navigate('/payroll/one-off?new=1')}>
            {t('payroll.page.timeline.oneOffPayment')}
          </button>
          <button type="button" className="btn-primary" onClick={() => navigate('/payroll/runs?new=1')}>
            + {t('payroll.page.timeline.newRun')}
          </button>
        </div>
      </div>

      <div className="sh-kpis">
        <div className="sh-kpi">
          <span className="sh-kpi-label">{t('payroll.overview.inProgress')}</span>
          <span className="sh-kpi-value">{data.draft ? data.draft.periodLabel : '—'}</span>
          <span className="sh-kpi-hint">{data.draft ? t('payroll.overview.people', { count: data.draft.people }) : t('payroll.overview.noDraft')}</span>
        </div>
        <div className="sh-kpi">
          <span className="sh-kpi-label">{last ? last.periodLabel : t('payroll.overview.lastRun')}</span>
          <span className="sh-kpi-value">{last ? totals(last.totals) : '—'}</span>
          <span className="sh-kpi-hint">{last ? t('payroll.overview.payslips', { count: last.people }) : t('payroll.overview.noRuns')}</span>
        </div>
        <div className="sh-kpi">
          <span className="sh-kpi-label">{t('payroll.overview.hoursPaid')}</span>
          <span className="sh-kpi-value">{last ? `${num(last.hours)} h` : '—'}</span>
          <span className="sh-kpi-hint">{last && last.overtimeHours ? t('payroll.overview.overtime', { hours: num(last.overtimeHours) }) : ' '}</span>
        </div>
        <div className="sh-kpi">
          <span className="sh-kpi-label">{t('payroll.overview.variation')}</span>
          <span className={`sh-kpi-value ${last?.variationPct && last.variationPct > 0 ? 'text-amber-700 dark:text-amber-300' : ''}`}>
            {last?.variationPct == null ? '—' : `${last.variationPct > 0 ? '+' : ''}${num(last.variationPct)} %`}
          </span>
          <span className="sh-kpi-hint">{t('payroll.overview.vsPrevious')}</span>
        </div>
      </div>

      <section className="card rules-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="card-title">{t('payroll.overview.pendingTitle')}</h3>
          {pendingCount > 0 ? <span className="to-chip to-chip-pending">{t('payroll.overview.pendingCount', { count: pendingCount })}</span> : <span className="to-chip to-chip-approved">{t('payroll.overview.allClear')}</span>}
        </div>
        <div className="full-table-wrap">
          <table className="table full-table !mt-0 to-table">
            <tbody>
              {pendingCount === 0 && (
                <tr>
                  <td className="text-ink-muted dark:text-dark-ink-muted">
                    <span className="inline-flex items-center gap-2"><CheckIcon className="h-4 w-4" />{t('payroll.overview.nothingPending')}</span>
                  </td>
                </tr>
              )}
              {p.unapprovedWeeks.map((w) => (
                <tr key={`w-${w.employeeId}-${w.weekStart}`}>
                  <td className="w-40"><span className="to-chip to-chip-pending">{t('payroll.overview.kind.hours')}</span></td>
                  <td className="!whitespace-normal">{t('payroll.overview.unapprovedWeek', { name: w.name, date: day(w.weekStart) })}</td>
                  <td className="text-right"><button type="button" className="to-link text-xs" onClick={() => navigate('/shifts/approvals')}>{t('payroll.overview.goApprovals')}</button></td>
                </tr>
              ))}
              {p.missingHours.map((m) => (
                <tr key={`m-${m.runId}-${m.employeeId}`}>
                  <td><span className="to-chip to-chip-pending">{t('payroll.overview.kind.hours')}</span></td>
                  <td className="!whitespace-normal">{t('payroll.overview.missingHours', { name: m.name })}</td>
                  <td className="text-right"><button type="button" className="to-link text-xs" onClick={() => navigate(`/payroll/runs/${m.runId}`)}>{t('payroll.overview.open')}</button></td>
                </tr>
              ))}
              {p.unconfirmedContracts.map((c) => (
                <tr key={`c-${c.employeeId}`}>
                  <td><span className="to-chip to-chip-rejected">{t('payroll.overview.kind.contract')}</span></td>
                  <td className="!whitespace-normal">{t('payroll.overview.unconfirmed', { name: c.name })}</td>
                  <td className="text-right"><button type="button" className="to-link text-xs" onClick={() => navigate('/payroll/people')}>{t('payroll.overview.goPeople')}</button></td>
                </tr>
              ))}
              {(p.missingTaxIds ?? []).map((c) => (
                <tr key={`t-${c.employeeId}`}>
                  <td><span className="to-chip to-chip-pending">{t('payroll.overview.kind.taxId', { label: taxIdLabel })}</span></td>
                  <td className="!whitespace-normal">{t('payroll.overview.missingTaxId', { name: c.name, label: taxIdLabel })}</td>
                  <td className="text-right"><button type="button" className="to-link text-xs" onClick={() => navigate('/payroll/people')}>{t('payroll.overview.goPeople')}</button></td>
                </tr>
              ))}
              {p.staleDrafts.map((d) => (
                <tr key={`d-${d.id}`}>
                  <td><span className="to-chip to-chip-cancelled">{t('payroll.overview.kind.draft')}</span></td>
                  <td className="!whitespace-normal">{t('payroll.overview.staleDraft', { period: d.periodLabel, count: d.days })}</td>
                  <td className="text-right"><button type="button" className="to-link text-xs" onClick={() => navigate(`/payroll/runs/${d.id}`)}>{t('payroll.overview.open')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <PayrollCostSection token={token} />

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="card-title">{t('payroll.overview.recentTitle')}</h3>
          <button type="button" className="to-link text-sm" onClick={() => navigate('/payroll/runs')}>{t('payroll.overview.seeAll')}</button>
        </div>
        <div className="full-table-wrap">
          <table className="table full-table !mt-0 to-table">
            <thead>
              <tr>
                <th>{t('payroll.overview.cols.period')}</th>
                <th>{t('payroll.overview.cols.frequency')}</th>
                <th>{t('payroll.overview.cols.people')}</th>
                <th>{t('payroll.overview.cols.total')}</th>
                <th>{t('payroll.overview.cols.status')}</th>
              </tr>
            </thead>
            <TableBody colSpan={5} isEmpty={data.recentRuns.length === 0} empty={{ icon: <BriefcaseIcon />, title: t('payroll.page.timeline.emptyTitle'), body: t('payroll.page.timeline.emptyBody') }} onAdd={() => navigate('/payroll/runs?new=1')} addLabel={t('payroll.page.timeline.newRun')}>
              {data.recentRuns.map((r) => (
                <tr key={r.id} className="to-row" onClick={() => navigate(`/payroll/runs/${r.id}`)}>
                  <td className="font-medium">{r.periodLabel}</td>
                  <td>{r.frequency ?? '—'}</td>
                  <td className="tabular-nums">{r.people}</td>
                  <td className="tabular-nums">{totals(r.totals)}</td>
                  <td>
                    <span className={`to-chip ${r.status === 'confirmed' ? 'to-chip-approved' : r.status === 'voided' ? 'to-chip-rejected' : 'to-chip-cancelled'}`}>
                      {t(`payroll.page.statusLabels.${r.status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </TableBody>
          </table>
        </div>
      </section>
    </div>
  );
}
