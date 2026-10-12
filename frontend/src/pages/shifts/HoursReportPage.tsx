import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type HoursReport, type HoursReportRow } from '../../api';
import { useToast } from '../../components/common/ToastProvider';
import Modal from '../../components/common/Modal';
import TableBody from '../../components/common/TableBody';
import TableSkeleton from '../../components/common/TableSkeleton';
import SendStripeInvoiceModal from '../../components/crm/SendStripeInvoiceModal';
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon } from '../../components/common/Icons';
import { usePermissions } from '../../contexts/PermissionsContext';
import { formatDuration, todayString } from '../../lib/shiftDates';
import { formatMoney } from '../../lib/currencies';

interface HoursReportPageProps {
  token: string;
}

type Group = HoursReport['groupBy'];
const GROUPS: Group[] = ['person', 'company', 'project'];
const RATE_KEY = 'northstack:shifts:invoiceRate:';

const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
function monthEnd(start: string): string {
  const [y, m] = start.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
function shiftMonth(start: string, by: number): string {
  const [y, m] = start.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 10);
}
const costText = (cost: Record<string, number> | null) => (cost && Object.keys(cost).length ? Object.entries(cost).map(([c, cents]) => formatMoney(cents, c)).join(' + ') : '—');

function readRate(companyId: string): string {
  try {
    return localStorage.getItem(RATE_KEY + companyId) ?? '';
  } catch {
    return '';
  }
}
function storeRate(companyId: string, rate: string) {
  try {
    localStorage.setItem(RATE_KEY + companyId, rate);
  } catch {
    // per-viewer convenience only
  }
}

const csvCell = (v: string | number | boolean | null) => {
  const s = v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Shifts → Reports (spec-shifts.md, Unidad 12): hours for a month by person, company or project —
// billable hours, and cost when the company shows it and the viewer has Payroll access. Company
// rows with billable hours can be invoiced through Payments (the usual Stripe invoice form, filled
// in with hours × rate, reviewed before sending). CSV of every entry.
export default function HoursReportPage({ token }: HoursReportPageProps) {
  const { t, i18n } = useTranslation('shifts');
  const toast = useToast();
  const { features } = usePermissions();
  const [from, setFrom] = useState(monthStart(todayString()));
  const [groupBy, setGroupBy] = useState<Group>('person');
  const [approvedOnly, setApprovedOnly] = useState(true);
  const [report, setReport] = useState<HoursReport | null>(null);
  const [tenantCurrency, setTenantCurrency] = useState('USD');
  const [invoiceFor, setInvoiceFor] = useState<HoursReportRow | null>(null);
  const [rate, setRate] = useState('');
  const [invoice, setInvoice] = useState<{ row: HoursReportRow; amount: string } | null>(null);
  const to = monthEnd(from);

  useEffect(() => {
    setReport(null);
    api
      .getHoursReport(token, { from, to, groupBy, approvedOnly })
      .then(setReport)
      .catch((error) => toast.error(t('reports.loadFailed', { message: (error as Error).message })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, from, to, groupBy, approvedOnly]);

  useEffect(() => {
    api
      .getCurrentTenant(token)
      .then((tenant) => setTenantCurrency(tenant.currency))
      .catch(() => undefined);
  }, [token]);

  const monthLabel = new Date(`${from}T00:00:00Z`).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const canInvoice = features.payments && groupBy === 'company';
  const cols = 3 + (report?.withCost ? 1 : 0) + (canInvoice ? 1 : 0);

  const downloadCsv = () => {
    if (!report) return;
    const header = ['date', 'person', 'company', 'project', 'source', 'description', 'minutes', 'hours', 'billable', 'week_status'];
    const lines = report.entries.map((e) =>
      [e.date, e.person, e.company, e.project, e.source, e.description, e.minutes, (e.minutes / 60).toFixed(2), e.billable, e.weekStatus].map(csvCell).join(','),
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hours-${from.slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rowName = (r: HoursReportRow) => r.name ?? (r.key ? t('reports.removed') : t(`reports.none.${groupBy}`));

  return (
    <div className="container sh-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="to-title">{t('reports.title')}</h2>
          <p className="to-subtitle">{t('reports.subtitle')}</p>
        </div>
        <div className="sh-weeknav">
          <button type="button" className="icon-btn" aria-label={t('reports.prevMonth')} onClick={() => setFrom(shiftMonth(from, -1))}>
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <span className="sh-weeknav-label capitalize">{monthLabel}</span>
          <button type="button" className="icon-btn" aria-label={t('reports.nextMonth')} onClick={() => setFrom(shiftMonth(from, 1))}>
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="sh-toolbar">
        <div className="mini-toggle-row" role="group" aria-label={t('reports.groupBy')}>
          {GROUPS.map((g) => (
            <button key={g} type="button" className={`mini-toggle-opt ${groupBy === g ? 'active' : ''}`} onClick={() => setGroupBy(g)}>
              {t(`reports.group.${g}`)}
            </button>
          ))}
        </div>
        <label className="rules-switch !m-0">
          <input type="checkbox" checked={approvedOnly} onChange={() => setApprovedOnly(!approvedOnly)} />
          {t('reports.approvedOnly')}
        </label>
        <button type="button" className="btn-secondary ml-auto" disabled={!report || report.entries.length === 0} onClick={downloadCsv}>
          {t('reports.csv')}
        </button>
      </div>

      {report && (
        <div className="sh-kpis">
          <div className="sh-kpi">
            <span className="sh-kpi-label">{t('reports.hours')}</span>
            <span className="sh-kpi-value">{formatDuration(report.totals.minutes)}</span>
          </div>
          <div className="sh-kpi">
            <span className="sh-kpi-label">{t('reports.billable')}</span>
            <span className="sh-kpi-value">{formatDuration(report.totals.billableMinutes)}</span>
            {report.totals.minutes > 0 && (
              <span className="sh-kpi-hint">{t('reports.billableShare', { pct: Math.round((report.totals.billableMinutes / report.totals.minutes) * 100) })}</span>
            )}
          </div>
          {report.withCost && (
            <div className="sh-kpi">
              <span className="sh-kpi-label">{t('reports.cost')}</span>
              <span className="sh-kpi-value">{costText(report.totals.cost)}</span>
              {report.totals.minutesWithoutRate > 0 && (
                <span className="sh-kpi-hint">{t('reports.withoutRate', { hours: formatDuration(report.totals.minutesWithoutRate) })}</span>
              )}
            </div>
          )}
        </div>
      )}

      {report === null ? (
        <TableSkeleton />
      ) : (
        <div className="full-table-wrap">
          <table className="table full-table !mt-0 to-table">
            <thead>
              <tr>
                <th>{t(`reports.group.${groupBy}`)}</th>
                <th>{t('reports.hours')}</th>
                <th>{t('reports.billable')}</th>
                {report.withCost && <th>{t('reports.cost')}</th>}
                {canInvoice && <th aria-label={t('reports.invoice')} />}
              </tr>
            </thead>
            <TableBody colSpan={cols} isEmpty={report.rows.length === 0} empty={{ icon: <ClockIcon />, title: t('reports.emptyTitle'), body: approvedOnly ? t('reports.emptyBodyApproved') : undefined }}>
              {report.rows.map((r) => (
                <tr key={r.key ?? 'none'}>
                  <td className={r.key ? 'font-medium' : 'text-ink-muted dark:text-dark-ink-muted'}>{rowName(r)}</td>
                  <td>{formatDuration(r.minutes)}</td>
                  <td>{r.billableMinutes ? formatDuration(r.billableMinutes) : '—'}</td>
                  {report.withCost && (
                    <td>
                      {costText(r.cost)}
                      {r.minutesWithoutRate > 0 && <small className="block text-ink-faint dark:text-dark-ink-faint">{t('reports.withoutRate', { hours: formatDuration(r.minutesWithoutRate) })}</small>}
                    </td>
                  )}
                  {canInvoice && (
                    <td>
                      {r.key && r.billableMinutes > 0 && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            className="to-link text-xs"
                            onClick={() => {
                              setRate(readRate(r.key!));
                              setInvoiceFor(r);
                            }}
                          >
                            {t('reports.invoice')}
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </TableBody>
          </table>
        </div>
      )}
      {report?.truncated && <p className="rules-hint">{t('reports.truncated')}</p>}

      {/* Hours × rate → the usual Stripe invoice form, filled in */}
      <Modal
        open={invoiceFor !== null}
        title={t('reports.invoiceTitle', { name: invoiceFor?.name ?? '' })}
        onClose={() => setInvoiceFor(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setInvoiceFor(null)}>
              {t('form.cancel')}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!(Number(rate) > 0)}
              onClick={() => {
                if (!invoiceFor) return;
                storeRate(invoiceFor.key!, rate);
                setInvoice({ row: invoiceFor, amount: ((invoiceFor.billableMinutes / 60) * Number(rate)).toFixed(2) });
                setInvoiceFor(null);
              }}
            >
              {t('reports.continue')}
            </button>
          </>
        }
      >
        {invoiceFor && (
          <div className="flex flex-col gap-3">
            <p className="m-0">{t('reports.invoiceBody', { hours: formatDuration(invoiceFor.billableMinutes), month: monthLabel })}</p>
            <div className="form-group !mb-0">
              <label htmlFor="invoice-rate">{t('reports.rate', { currency: tenantCurrency })}</label>
              <input id="invoice-rate" type="number" min={0} step="0.01" className="max-w-[10rem]" value={rate} onChange={(e) => setRate(e.target.value)} autoFocus />
            </div>
            {Number(rate) > 0 && <p className="m-0 font-semibold">{formatMoney(Math.round((invoiceFor.billableMinutes / 60) * Number(rate) * 100), tenantCurrency)}</p>}
            <p className="rules-hint m-0">{t('reports.invoiceHint')}</p>
          </div>
        )}
      </Modal>

      {invoice && (
        <SendStripeInvoiceModal
          open
          onClose={() => setInvoice(null)}
          onSent={() => toast.success(t('reports.invoiceSent'))}
          token={token}
          companyId={invoice.row.key!}
          companyName={invoice.row.name ?? ''}
          defaultCurrency={tenantCurrency}
          initialLines={[{ description: t('reports.invoiceLine', { hours: formatDuration(invoice.row.billableMinutes), month: monthLabel, rate }), amount: invoice.amount }]}
        />
      )}
    </div>
  );
}
