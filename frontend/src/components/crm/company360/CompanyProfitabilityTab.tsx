import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type CompanyProfitability, type ProfitMoney } from '../../../api';
import { formatMoney } from '../../../lib/currencies';

// Cruces D1: profitability of this client for a period — revenue (Stripe if linked and you can see
// payments, otherwise estimated from its products), minus labor (hours on it × each person's
// hourly cost, payroll only) and the expenses assigned to it (Gastos only).
const PRESETS = ['month', 'quarter', 'year', 'twelve'] as const;
type Preset = (typeof PRESETS)[number];

const iso = (d: Date) => d.toISOString().slice(0, 10);
function rangeFor(p: Preset) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (p === 'month') return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(now) };
  if (p === 'quarter') return { from: iso(new Date(Date.UTC(y, m - 2, 1))), to: iso(now) };
  if (p === 'year') return { from: `${y}-01-01`, to: iso(now) };
  return { from: iso(new Date(Date.UTC(y, m - 11, 1))), to: iso(now) };
}

export function moneyList(list: ProfitMoney | null | undefined) {
  if (!list || !list.length) return '—';
  return list.map((m) => formatMoney(m.cents, m.currency)).join(' + ');
}

export default function CompanyProfitabilityTab({ token, companyId }: { token: string; companyId: string }) {
  const { t } = useTranslation('crm');
  const [preset, setPreset] = useState<Preset>('quarter');
  const [data, setData] = useState<CompanyProfitability | null>(null);

  useEffect(() => {
    setData(null);
    api
      .getCompanyProfitability(token, companyId, rangeFor(preset))
      .then(setData)
      .catch(() => setData(null));
  }, [token, companyId, preset]);

  const negative = (data?.profit ?? []).some((p) => p.cents < 0);
  return (
    <div className="overview-panel-left">
      <div className="field-group border-b-0">
        <h4 className="field-group-title">{t('profit.title')}</h4>
        <div className="mini-toggle-row mb-3">
          {PRESETS.map((p) => (
            <button key={p} type="button" className={`mini-toggle-opt ${preset === p ? 'active' : ''}`} onClick={() => setPreset(p)}>
              {t(`profit.period.${p}`)}
            </button>
          ))}
        </div>
        {!data ? (
          <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('company360.loading')}</p>
        ) : (
          <>
            <ul className="ex-due">
              <li>
                <span className="flex flex-col">
                  <strong className="text-sm">{t('profit.revenue')}</strong>
                  <span className="ex-muted text-xs">{t(`profit.source.${data.revenueSource}`)}</span>
                </span>
                <span className="num">{moneyList(data.revenue)}</span>
              </li>
              <li>
                <span className="flex flex-col">
                  <strong className="text-sm">{t('profit.labor')}</strong>
                  <span className="ex-muted text-xs">
                    {data.labor === null ? t('profit.needsPayroll') : t('profit.hours', { hours: Math.round(((data.laborMinutes ?? 0) / 60) * 10) / 10 })}
                  </span>
                </span>
                <span className="num">{data.labor === null ? '—' : `− ${moneyList(data.labor)}`}</span>
              </li>
              <li>
                <span className="flex flex-col">
                  <strong className="text-sm">{t('profit.expenses')}</strong>
                  <span className="ex-muted text-xs">{data.expenses === null ? t('profit.needsExpenses') : t('profit.expensesHint')}</span>
                </span>
                <span className="num">{data.expenses === null ? '—' : `− ${moneyList(data.expenses)}`}</span>
              </li>
              <li>
                <strong>{t('profit.result')}</strong>
                <strong className={`num ${negative ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`}>{moneyList(data.profit)}</strong>
              </li>
            </ul>
            <p className="mt-2 mb-0 text-xs text-ink-muted dark:text-dark-ink-muted">{t('profit.note')}</p>
          </>
        )}
      </div>
    </div>
  );
}
