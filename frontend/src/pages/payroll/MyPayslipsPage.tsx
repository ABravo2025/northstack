import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { PayslipRow } from '../../api';
import TableBody from '../../components/common/TableBody';
import TableSkeleton from '../../components/common/TableSkeleton';
import PayslipPreviewModal from '../../components/payroll/PayslipPreviewModal';
import PayrollHoursCard from '../../components/shifts/PayrollHoursCard';
import { ListIcon } from '../../components/common/Icons';
import { useToast } from '../../components/common/ToastProvider';
import { formatMoney } from '../../lib/currencies';

// Payroll v2 (spec-payroll-v2.md §0.1–2, unit 6): the person's own payslips, with amounts — never
// anyone else's. Everyone in a company with Payroll has it, whatever their role.
export default function MyPayslipsPage({ token }: { token: string }) {
  const { t, i18n } = useTranslation('hr');
  const toast = useToast();
  const [rows, setRows] = useState<PayslipRow[] | null>(null);
  const [open, setOpen] = useState<PayslipRow | null>(null);

  useEffect(() => {
    api
      .listMyPayslips(token)
      .then(setRows)
      .catch((e) => {
        setRows([]);
        toast.error((e as Error).message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="container sh-page">
      <div>
        <h2 className="to-title">{t('payroll.nav.mine')}</h2>
        <p className="to-subtitle">{t('payroll.mine.subtitle')}</p>
      </div>
      {rows === null ? (
        <TableSkeleton />
      ) : (
        <div className="full-table-wrap">
          <table className="table full-table !mt-0 to-table">
            <thead>
              <tr>
                <th>{t('payroll.payslips.cols.period')}</th>
                <th>{t('payroll.payslips.cols.number')}</th>
                <th>{t('payroll.payslips.cols.paymentDate')}</th>
                <th>{t('payroll.mine.gross')}</th>
                <th>{t('payroll.mine.deductions')}</th>
                <th>{t('payroll.payslips.cols.net')}</th>
                <th />
              </tr>
            </thead>
            <TableBody colSpan={7} isEmpty={rows.length === 0} empty={{ icon: <ListIcon />, title: t('payroll.mine.emptyTitle'), body: t('payroll.mine.emptyBody') }}>
              {rows.map((p) => (
                <tr key={p.id} className="to-row" onClick={() => setOpen(p)}>
                  <td className="font-medium">{p.periodLabel}</td>
                  <td className="font-mono text-xs tabular-nums">
                    {p.number}
                    {p.voidedAt && <span className="to-chip to-chip-rejected ml-2 font-sans">{t('payroll.payslips.voided')}</span>}
                  </td>
                  <td className="tabular-nums">{day(p.paymentDate)}</td>
                  <td className="tabular-nums">{formatMoney(p.grossCents, p.currency)}</td>
                  <td className="tabular-nums">{p.deductionsCents ? formatMoney(p.deductionsCents, p.currency) : '—'}</td>
                  <td className="font-semibold tabular-nums">{formatMoney(p.netCents, p.currency)}</td>
                  <td className="text-right"><span className="to-link text-xs">{t('payroll.payslips.view')}</span></td>
                </tr>
              ))}
            </TableBody>
          </table>
        </div>
      )}
      <PayrollHoursCard token={token} />
      {open && (
        <PayslipPreviewModal
          open
          onClose={() => setOpen(null)}
          fetchPdf={() => api.getPayslipPdf(token, open.id)}
          title={t('payroll.payslips.modalTitle', { number: open.number })}
          downloadFilename={`payslip-${open.number}.pdf`}
          helperText={t('payroll.mine.modalHint')}
        />
      )}
    </div>
  );
}
