import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { MyPayrollHours } from '../../api';

// Timesheet → "Hours sent to payroll" (Alejandro, 2026-10-21: transparency for each person): the hours
// of each pay run they're in — from their approved weeks or typed in by payroll — and whether the
// run is confirmed or still being prepared. Hours only; amounts stay in Payroll. Hidden when there
// is nothing (fixed salary, or never in an hourly run).
export default function PayrollHoursCard({ token }: { token: string }) {
  const { t, i18n } = useTranslation('shifts');
  const [rows, setRows] = useState<MyPayrollHours[] | null>(null);

  useEffect(() => {
    api
      .getMyPayrollHours(token)
      .then(setRows)
      .catch(() => setRows([]));
  }, [token]);

  if (!rows || rows.length === 0) return null;
  const day = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  return (
    <section className="card rules-card" id="payroll-hours">
      <h3 className="card-title">{t('timesheet.payroll.title')}</h3>
      <p className="rules-lead">{t('timesheet.payroll.lead')}</p>
      <div className="full-table-wrap">
        <table className="table full-table !mt-0 to-table">
          <thead>
            <tr>
              <th>{t('timesheet.payroll.run')}</th>
              <th>{t('timesheet.payroll.period')}</th>
              <th>{t('timesheet.payroll.hours')}</th>
              <th>{t('timesheet.payroll.status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.periodLabel}</td>
                <td>{r.from && r.to ? `${day(r.from)} – ${day(r.to)}` : t('timesheet.payroll.manual')}</td>
                <td className="tabular-nums">{r.overtimeHours
                    ? t('timesheet.payroll.hoursWithExtra', { hours: (r.hours + r.overtimeHours).toLocaleString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US'), extra: r.overtimeHours.toLocaleString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US') })
                    : t('timesheet.payroll.hoursValue', { hours: r.hours.toLocaleString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US') })}</td>
                <td>
                  <span className={`to-chip ${r.status === 'confirmed' ? 'to-chip-approved' : 'to-chip-pending'}`}>{t(`timesheet.payroll.state.${r.status}`)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
