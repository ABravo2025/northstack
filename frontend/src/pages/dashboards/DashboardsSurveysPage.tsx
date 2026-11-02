import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type FormsDashboard } from '../../api';
import BarChartCard from '../../components/metrics/BarChartCard';
import StatTile from '../../components/metrics/StatTile';
import { seriesColor } from '../../lib/metricsFormat';
import { formatNumber } from '../../lib/currencies';
import type { DashboardsOutletContext } from '../../layouts/DashboardsLayout';
import { monthName } from '../expenses/expensesShared';

// Dashboards → Encuestas (spec-clientes-gastos-formularios.md, B6). The range comes from the
// shared Dashboards filter; the department filter applies to employee surveys (eNPS), the only
// ones tied to a department. eNPS is hidden below each survey's anonymity threshold.
const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function DashboardsSurveysPage() {
  const { t, i18n } = useTranslation('forms');
  const { token, range } = useOutletContext<DashboardsOutletContext>();
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [departmentId, setDepartmentId] = useState('');
  const [data, setData] = useState<FormsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    api
      .listFieldCatalogDefinitions(token, 'department')
      .then((rows) => setDepartments(rows.filter((r) => r.isActive).map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => setDepartments([]));
  }, [token]);

  const from = localDate(range.since);
  const to = localDate(range.until);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getFormsDashboard(token, { from, to, departmentId: departmentId || undefined })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setFailure((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, from, to, departmentId]);

  if (failure) return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{failure}</p>;
  if (!data) return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('modal.loading')}</p>;

  const monthLabel = (period: string) => {
    const name = monthName(period, i18n.language);
    return `${name.charAt(0).toUpperCase()}${name.slice(1, 3)} ${period.slice(2, 4)}`;
  };
  const score = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v}`);
  const empty = data.totalResponses === 0;

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="ex-field">
          {t('dash.department')}
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">{t('dash.allDepartments')}</option>
            <option value="none">{t('dash.noDepartment')}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <span className="ex-hint mb-2">{t('dash.departmentHint')}</span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t('dash.nps')} value={score(data.nps.score)} subtitle={t('dash.answers', { count: data.nps.count })} />
        <StatTile
          label={t('dash.csat')}
          value={data.csat.average === null ? '—' : formatNumber(data.csat.average, 1)}
          subtitle={data.csat.satisfiedPct === null ? t('dash.answers', { count: 0 }) : t('dash.satisfied', { pct: data.csat.satisfiedPct })}
        />
        <StatTile
          label={t('dash.enps')}
          value={score(data.enps.score)}
          subtitle={data.enps.score === null && data.enps.count > 0 ? t('dash.belowThreshold', { min: data.enps.minGroup }) : t('dash.answers', { count: data.enps.count })}
        />
        <StatTile label={t('dash.leads')} value={String(data.leads.count)} subtitle={t('dash.responses', { count: data.totalResponses })} />
      </div>

      {empty ? (
        <div className="card text-sm text-ink-muted dark:text-dark-ink-muted">{t('dash.empty')}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BarChartCard
            title={t('dash.npsDistribution')}
            data={data.nps.distribution.map((d) => ({ name: String(d.value), count: d.count }))}
            series={[{ key: 'count', label: t('dash.answersSeries'), color: seriesColor(0) }]}
          />
          <BarChartCard
            title={t('dash.npsByMonth')}
            data={data.nps.byMonth.map((m) => ({ name: monthLabel(m.month), score: m.score ?? 0 }))}
            series={[{ key: 'score', label: t('dash.nps'), color: seriesColor(1) }]}
          />
          <div className="card">
            <h3 className="card-title">{t('dash.enpsByDepartment')}</h3>
            <p className="mt-0 text-xs text-ink-muted dark:text-dark-ink-muted">
              {data.enps.departmentsHidden ? t('dash.departmentsHidden', { min: data.enps.minGroup }) : t('dash.thresholdNote', { min: data.enps.minGroup })}
            </p>
            {data.enps.byDepartment.length === 0 ? (
              <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('dash.noEnps')}</p>
            ) : (
              <div className="full-table-wrap">
                <table className="full-table">
                  <thead>
                    <tr>
                      <th>{t('dash.department')}</th>
                      <th className="text-right">{t('dash.answersSeries')}</th>
                      <th className="text-right">{t('dash.enps')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.enps.byDepartment.map((d) => (
                      <tr key={d.departmentId ?? 'none'} className="border-t border-line-soft dark:border-dark-line-soft">
                        <td>{d.name ?? t('dash.noDepartment')}</td>
                        <td className="num text-right">{d.count}</td>
                        <td className="num text-right">{d.score === null ? <span className="ex-muted">{t('dash.hidden')}</span> : score(d.score)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <BarChartCard
            title={t('dash.leadsBySource')}
            data={data.leads.bySource.map((s) => ({ name: t(`dash.source.${s.source}`, { defaultValue: s.source }), count: s.count }))}
            series={[{ key: 'count', label: t('dash.leads'), color: seriesColor(2) }]}
          />
          <BarChartCard
            title={t('dash.byModule')}
            data={data.byModule.map((m) => ({ name: t(`module.${m.module}`), count: m.count }))}
            series={[{ key: 'count', label: t('dash.answersSeries'), color: seriesColor(0) }]}
          />
        </div>
      )}
    </div>
  );
}
