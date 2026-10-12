import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type TimesheetApprovalRow, type TimesheetStatus } from '../../api';
import { useToast } from '../../components/common/ToastProvider';
import TableBody from '../../components/common/TableBody';
import TableSkeleton from '../../components/common/TableSkeleton';
import { ClockIcon } from '../../components/common/Icons';
import { formatDuration, formatWeekRange } from '../../lib/shiftDates';

interface TimesheetApprovalsPageProps {
  token: string;
}

const TABS: TimesheetStatus[] = ['submitted', 'returned', 'approved'];

// Shifts → Approvals (spec-shifts.md, Unidad 11): the weeks waiting for this person's decision —
// their direct reports', or everyone's with approve_timesheets. A row opens that week, where the
// approve / send back / reopen buttons live.
export default function TimesheetApprovalsPage({ token }: TimesheetApprovalsPageProps) {
  const { t, i18n } = useTranslation('shifts');
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TimesheetStatus>('submitted');
  const [rows, setRows] = useState<TimesheetApprovalRow[] | null>(null);
  const [canApprove, setCanApprove] = useState(true);

  useEffect(() => {
    setRows(null);
    api
      .listTimesheetApprovals(token, tab)
      .then((r) => {
        setCanApprove(r.canApprove);
        setRows(r.timesheets);
      })
      .catch((error) => toast.error(t('timesheet.loadFailed', { message: (error as Error).message })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tab]);

  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { day: 'numeric', month: 'short' }) : '—');

  return (
    <div className="container sh-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="to-title">{t('approvals.title')}</h2>
          <p className="to-subtitle">{t('approvals.subtitle')}</p>
        </div>
        <div className="mini-toggle-row" role="tablist">
          {TABS.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={tab === s} className={`mini-toggle-opt ${tab === s ? 'active' : ''}`} onClick={() => setTab(s)}>
              {t(`approvals.tab.${s}`)}
            </button>
          ))}
        </div>
      </div>

      {!canApprove ? (
        <p className="sh-note-box">{t('approvals.nobody')}</p>
      ) : rows === null ? (
        <TableSkeleton />
      ) : (
        <div className="full-table-wrap">
          <table className="table full-table !mt-0 to-table">
            <thead>
              <tr>
                <th>{t('approvals.col.person')}</th>
                <th>{t('approvals.col.week')}</th>
                <th>{t('approvals.col.logged')}</th>
                <th>{t('approvals.col.billable')}</th>
                <th>{t('approvals.col.adjustments')}</th>
                <th>{tab === 'submitted' ? t('approvals.col.submitted') : t('approvals.col.decided')}</th>
              </tr>
            </thead>
            <TableBody colSpan={6} isEmpty={rows.length === 0} empty={{ icon: <ClockIcon />, title: t(`approvals.empty.${tab}`) }}>
              {rows.map((r) => (
                <tr key={r.id} className="to-row" onClick={() => navigate(`/shifts/timesheet?week=${r.weekStart}&employee=${r.employee.id}`)}>
                  <td className="font-medium">
                    {r.employee.firstName} {r.employee.lastName}
                  </td>
                  <td>{formatWeekRange(r.weekStart, i18n.language)}</td>
                  <td>{formatDuration(r.loggedMinutes)}</td>
                  <td>{r.billableMinutes ? formatDuration(r.billableMinutes) : '—'}</td>
                  <td>{r.adjustments || '—'}</td>
                  <td>{when(tab === 'submitted' ? r.submittedAt : r.decidedAt)}</td>
                </tr>
              ))}
            </TableBody>
          </table>
        </div>
      )}
    </div>
  );
}
