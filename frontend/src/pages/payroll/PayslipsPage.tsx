import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { PayslipRow } from '../../api';
import TableBody from '../../components/common/TableBody';
import TableSkeleton from '../../components/common/TableSkeleton';
import PayslipPreviewModal from '../../components/payroll/PayslipPreviewModal';
import { ListIcon, MailIcon, SearchIcon } from '../../components/common/Icons';
import { useToast } from '../../components/common/ToastProvider';
import { formatMoney } from '../../lib/currencies';

// Payroll v2 (spec-payroll-v2.md, unit 6): every issued payslip, for whoever runs payroll — search
// by person or period, open the PDF, resend it to the person.
export default function PayslipsPage({ token }: { token: string }) {
  const { t, i18n } = useTranslation('hr');
  const toast = useToast();
  const [rows, setRows] = useState<PayslipRow[] | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<PayslipRow | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      api
        .listPayslips(token, q.trim() || undefined)
        .then(setRows)
        .catch((e) => toast.error((e as Error).message));
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, q]);

  const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

  const resend = async (p: PayslipRow) => {
    try {
      await api.resendPayslip(token, p.id);
      toast.success(t('payroll.payslips.resent', { name: p.employeeName ?? '' }));
      setRows((prev) => prev?.map((r) => (r.id === p.id ? { ...r, emailedAt: new Date().toISOString() } : r)) ?? prev);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="container sh-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="to-title">{t('payroll.nav.payslips')}</h2>
          <p className="to-subtitle">{t('payroll.payslips.subtitle')}</p>
        </div>
        <div className="toolbar-search">
          <SearchIcon />
          <label htmlFor="payslip-search" className="sr-only">{t('payroll.payslips.search')}</label>
          <input id="payslip-search" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('payroll.payslips.search')} />
        </div>
      </div>
      {rows === null ? (
        <TableSkeleton />
      ) : (
        <div className="full-table-wrap">
          <table className="table full-table !mt-0 to-table">
            <thead>
              <tr>
                <th>{t('payroll.payslips.cols.number')}</th>
                <th>{t('payroll.payslips.cols.person')}</th>
                <th>{t('payroll.payslips.cols.period')}</th>
                <th>{t('payroll.payslips.cols.paymentDate')}</th>
                <th>{t('payroll.payslips.cols.net')}</th>
                <th>{t('payroll.payslips.cols.sent')}</th>
                <th />
              </tr>
            </thead>
            <TableBody colSpan={7} isEmpty={rows.length === 0} empty={{ icon: <ListIcon />, title: t('payroll.payslips.emptyTitle'), body: t('payroll.payslips.emptyBody') }}>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-xs tabular-nums">
                    {p.number}
                    {p.voidedAt && <span className="to-chip to-chip-rejected ml-2 font-sans" title={p.voidReason ?? undefined}>{t('payroll.payslips.voided')}</span>}
                  </td>
                  <td className="font-medium">{p.employeeName}</td>
                  <td>{p.periodLabel}</td>
                  <td className="tabular-nums">{day(p.paymentDate)}</td>
                  <td className="tabular-nums">{formatMoney(p.netCents, p.currency)}</td>
                  <td>{p.emailedAt ? <span className="to-chip to-chip-approved">{t('payroll.payslips.sent')}</span> : <span className="text-ink-faint dark:text-dark-ink-faint">—</span>}</td>
                  <td>
                    <div className="flex justify-end gap-3 whitespace-nowrap">
                      <button type="button" className="to-link text-xs" onClick={() => setOpen(p)}>{t('payroll.payslips.view')}</button>
                      {!p.voidedAt && (
                        <button type="button" className="to-link inline-flex items-center gap-1 text-xs" onClick={() => resend(p)}>
                          <MailIcon className="h-3.5 w-3.5" />
                          {t('payroll.payslips.resend')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </TableBody>
          </table>
        </div>
      )}
      {open && (
        <PayslipPreviewModal
          open
          onClose={() => setOpen(null)}
          fetchPdf={() => api.getPayslipPdf(token, open.id)}
          title={t('payroll.payslips.modalTitle', { number: open.number })}
          downloadFilename={`payslip-${open.number}.pdf`}
          helperText={t('payroll.payslips.modalHint')}
        />
      )}
    </div>
  );
}
