import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { PublicClientReport } from '../../api/shifts';
import { formatDay, formatDuration } from '../../lib/shiftDates';

// The private link a client gets for their hours report (spec-shifts-fase2.md §D) — public, no
// session; the token in the URL is the credential. Read-only, approved hours only, 30 days.
export default function ClientReportPage() {
  const { t, i18n } = useTranslation('shifts');
  const { token = '' } = useParams();
  const [report, setReport] = useState<PublicClientReport | null>(null);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    api
      .getPublicClientReport(token)
      .then(setReport)
      .catch(() => setInvalid(true));
  }, [token]);

  const lang = i18n.language.startsWith('es') ? 'es' : 'en';
  const day = (d: string) => formatDay(d, i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="page">
      <div className="header">
        <img src="/logo-horizontal-light.svg" alt="Northstack" className="dark:hidden" />
        <img src="/logo-horizontal-dark.svg" alt="Northstack" className="hidden dark:block" />
      </div>
      <div className="container">
        <div className="card mx-auto mt-10 flex max-w-4xl flex-col gap-4">
          {!report && !invalid && <p className="m-0 text-ink-muted dark:text-dark-ink-muted">{t('clientReport.loading')}</p>}
          {invalid && (
            <>
              <h2 className="m-0">{t('clientReport.invalid')}</h2>
              <p className="m-0 text-ink-muted dark:text-dark-ink-muted">{t('clientReport.invalidBody')}</p>
            </>
          )}
          {report && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="m-0">{t('clientReport.publicTitle', { company: report.company.name })}</h2>
                  <p className="m-0 text-ink-muted dark:text-dark-ink-muted">
                    {t('clientReport.publicFrom', { tenant: report.tenantName, from: day(report.from), to: day(report.to) })}
                    {report.project && ` · ${report.project.name}`}
                  </p>
                </div>
                <a className="btn-secondary" href={api.publicClientReportPdfUrl(token, lang)} target="_blank" rel="noreferrer">
                  {t('clientReport.pdf')}
                </a>
              </div>

              <div className="sh-kpis rep-kpis">
                <div className="sh-kpi">
                  <span className="sh-kpi-label">{t('clientReport.total')}</span>
                  <span className="sh-kpi-value">{formatDuration(report.totalMinutes)}</span>
                </div>
                <div className="sh-kpi">
                  <span className="sh-kpi-label">{t('clientReport.billable')}</span>
                  <span className="sh-kpi-value">{formatDuration(report.billableMinutes)}</span>
                </div>
              </div>

              {/* Phones: one card per line instead of a table that would need sideways scrolling. */}
              <ul className="m-0 flex list-none flex-col gap-2 p-0 sm:hidden">
                {report.lines.length === 0 && <li className="text-ink-muted dark:text-dark-ink-muted">{t('clientReport.none')}</li>}
                {report.lines.map((l, i) => (
                  <li key={i} className="rounded-xl border border-line p-3 text-sm dark:border-dark-line">
                    <div className="flex justify-between gap-2 font-semibold">
                      <span>{day(l.date)}</span>
                      <span>
                        {formatDuration(l.minutes)}
                        {!l.billable && <small className="ml-1 font-normal text-ink-faint dark:text-dark-ink-faint">{t('clientReport.notBillable')}</small>}
                      </span>
                    </div>
                    {report.showPeople && <div>{l.person}</div>}
                    <div className="text-ink-muted dark:text-dark-ink-muted">{[l.project, l.description].filter(Boolean).join(' · ') || '—'}</div>
                  </li>
                ))}
              </ul>
              <div className="full-table-wrap hidden sm:block">
                <table className="table full-table !mt-0 to-table">
                  <thead>
                    <tr>
                      <th>{t('clientReport.date')}</th>
                      {report.showPeople && <th>{t('clientReport.person')}</th>}
                      <th>{t('clientReport.details')}</th>
                      <th>{t('clientReport.hours')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.lines.length === 0 && (
                      <tr>
                        <td colSpan={report.showPeople ? 4 : 3} className="text-ink-muted dark:text-dark-ink-muted">
                          {t('clientReport.none')}
                        </td>
                      </tr>
                    )}
                    {report.lines.map((l, i) => (
                      <tr key={i}>
                        <td className="whitespace-nowrap">{day(l.date)}</td>
                        {report.showPeople && <td>{l.person}</td>}
                        <td className="!whitespace-normal">{[l.project, l.description].filter(Boolean).join(' · ') || '—'}</td>
                        <td className="whitespace-nowrap">
                          {formatDuration(l.minutes)}
                          {!l.billable && <small className="ml-1 text-ink-faint dark:text-dark-ink-faint">{t('clientReport.notBillable')}</small>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="rules-hint m-0">{t('clientReport.expires', { date: day(report.expiresAt.slice(0, 10)) })}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
