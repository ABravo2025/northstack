import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TimeOffBalance, TimeOffRequest } from '../../api';
import TableBody from '../common/TableBody';
import Avatar from '../common/Avatar';
import { SearchIcon, TeamIcon } from '../common/Icons';
import { BalanceMeter, PolicyName, availableDays, grantedDays, policyColor, useDateRangeFormatter } from './timeOffShared';

export interface TeamPerson {
  employeeId: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  department: string;
  balances: TimeOffBalance[];
  pendingCount: number;
  nextTimeOff: string | null;
}

interface TeamTimeOffViewProps {
  isAdmin: boolean;
  people: TeamPerson[];
  pendingApprovals: TimeOffRequest[];
  balances: TimeOffBalance[];
  mainPolicyId: string | null;
  onDecide: (requestId: string, status: 'approved' | 'rejected', note?: string) => Promise<void> | void;
  onOpenPerson: (employeeId: string) => void;
}

// "Team" — replaces Approvals + Balances + All Requests. What's waiting on you comes first
// (approve/reject right on the card); below it, one row per person with their balance of the
// tenant's main policy; a row opens that person's full picture (TeamMemberDetail).
export default function TeamTimeOffView({ isAdmin, people, pendingApprovals, balances, mainPolicyId, onDecide, onOpenPerson }: TeamTimeOffViewProps) {
  const { t } = useTranslation('tasks');
  const dates = useDateRangeFormatter();
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const visiblePeople = people.filter(
    (p) => !q || `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) || p.department.toLowerCase().includes(q),
  );
  const mainPolicyName = people.flatMap((p) => p.balances).find((b) => b.timeOffPolicyId === mainPolicyId)?.policyName;
  const colSpan = isAdmin ? 5 : 4;

  return (
    <div className="to-view">
      <div className="to-head">
        <div>
          <h2 className="to-title">{t('timeOff.team.title')}</h2>
          <p className="to-subtitle">{isAdmin ? t('timeOff.team.subtitleAdmin') : t('timeOff.team.subtitleManager')}</p>
        </div>
      </div>

      <div className="to-section">
        <h3 className="to-section-title">
          {t('timeOff.team.awaiting')} <span className="to-faint num">{pendingApprovals.length}</span>
        </h3>
        {pendingApprovals.length === 0 ? (
          <div className="to-all-clear">{t('timeOff.team.allClear')}</div>
        ) : (
          <div className="to-approvals">
            {pendingApprovals.map((r) => (
              <ApprovalCard
                key={r.id}
                request={r}
                balance={balances.find((b) => b.employeeId === r.employeeId && b.timeOffPolicyId === r.timeOffPolicyId)}
                dateRange={dates.range(r.startDate, r.endDate)}
                onDecide={onDecide}
                onOpenPerson={onOpenPerson}
              />
            ))}
          </div>
        )}
      </div>

      <div className="to-section">
        <div className="to-head">
          <h3 className="to-section-title">
            {t('timeOff.team.people')} <span className="to-faint num">{visiblePeople.length}</span>
          </h3>
          {people.length > 0 && (
            <label className="toolbar-search to-search">
              <SearchIcon />
              <span className="sr-only">{t('timeOff.team.searchLabel')}</span>
              <input
                id="time-off-team-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('timeOff.team.searchPlaceholder')}
              />
            </label>
          )}
        </div>
        <div className="full-table-wrap">
          <table className="table full-table !mt-0 to-table">
            <thead>
              <tr>
                <th>{t('timeOff.team.columns.person')}</th>
                {isAdmin && <th>{t('timeOff.team.columns.area')}</th>}
                <th>
                  {t('timeOff.team.columns.available')}
                  {mainPolicyName ? ` · ${mainPolicyName}` : ''}
                </th>
                <th>{t('timeOff.team.columns.requests')}</th>
                <th>{t('timeOff.team.columns.next')}</th>
              </tr>
            </thead>
            <TableBody
              colSpan={colSpan}
              isEmpty={visiblePeople.length === 0}
              empty={
                people.length === 0
                  ? { icon: <TeamIcon />, title: t('timeOff.team.noPeople') }
                  : {
                      icon: <SearchIcon />,
                      title: t('timeOff.team.noMatches', { search }),
                      actions: (
                        <button type="button" className="btn-secondary btn-md" onClick={() => setSearch('')}>
                          {t('timeOff.team.clearSearch')}
                        </button>
                      ),
                    }
              }
            >
              {visiblePeople.map((p) => {
                const main = p.balances.find((b) => b.timeOffPolicyId === mainPolicyId) ?? p.balances[0];
                return (
                  <tr
                    key={p.employeeId}
                    className="to-row"
                    tabIndex={0}
                    onClick={() => onOpenPerson(p.employeeId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenPerson(p.employeeId);
                      }
                    }}
                  >
                    <td>
                      <span className="to-person">
                        <Avatar firstName={p.firstName} lastName={p.lastName} />
                        <span className="to-person-text">
                          <b>
                            {p.firstName} {p.lastName}
                          </b>
                          {p.jobTitle && <span>{p.jobTitle}</span>}
                        </span>
                      </span>
                    </td>
                    {isAdmin && <td className="to-muted">{p.department}</td>}
                    <td>
                      {main ? (
                        <span className="to-mini-meter num">
                          <BalanceMeter balance={main} color={policyColor(main.color)} />
                          <span>
                            <b>{availableDays(main)}</b> <span className="to-faint">{t('timeOff.team.ofTotal2', { total: grantedDays(main) })}</span>
                          </span>
                        </span>
                      ) : (
                        <span className="to-faint">—</span>
                      )}
                    </td>
                    <td>
                      {p.pendingCount > 0 ? (
                        <span className="to-chip to-chip-pending num">{t('timeOff.team.inReview', { count: p.pendingCount })}</span>
                      ) : (
                        <span className="to-faint">—</span>
                      )}
                    </td>
                    <td className="to-muted num">{p.nextTimeOff ? dates.day(p.nextTimeOff) : '—'}</td>
                  </tr>
                );
              })}
            </TableBody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface ApprovalCardProps {
  request: TimeOffRequest;
  balance: TimeOffBalance | undefined;
  dateRange: string;
  onDecide: TeamTimeOffViewProps['onDecide'];
  onOpenPerson: (employeeId: string) => void;
  compact?: boolean;
}

// Exported so TeamMemberDetail can show the same card for that person's pending requests.
export function ApprovalCard({ request: r, balance, dateRange, onDecide, onOpenPerson, compact }: ApprovalCardProps) {
  const { t } = useTranslation('tasks');
  const dates = useDateRangeFormatter();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const firstName = r.employee?.firstName ?? '';

  const decide = async (status: 'approved' | 'rejected') => {
    setBusy(true);
    try {
      await onDecide(r.id, status, status === 'rejected' ? note.trim() || undefined : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`to-ap${compact ? ' to-ap-compact' : ''}`}>
      {!compact && r.employee && (
        <div className="to-person">
          <Avatar firstName={r.employee.firstName} lastName={r.employee.lastName} />
          <span className="to-person-text">
            <b>
              {r.employee.firstName} {r.employee.lastName}
            </b>
            <span className="num">
              {t('timeOff.requestDetail.requested')} · {dates.day(r.createdAt)}
            </span>
          </span>
        </div>
      )}
      <div className="to-ap-facts num">
        <div>
          {t('timeOff.team.policy')}
          <strong>
            <PolicyName name={r.timeOffPolicy.name} color={r.timeOffPolicy.color} />
          </strong>
        </div>
        <div>
          {t('timeOff.team.dates')}
          <strong>{dateRange}</strong>
        </div>
        <div>
          {t('timeOff.team.wouldLeave')}
          <strong>{balance ? t('timeOff.team.ofTotal', { left: availableDays(balance), total: grantedDays(balance) }) : '—'}</strong>
        </div>
      </div>
      {r.note && <p className="to-ap-note">“{r.note}”</p>}
      {rejecting ? (
        <div className="to-ap-reject">
          <div className="form-group !mb-0">
            <label htmlFor={`reject-note-${r.id}`}>{t('timeOff.team.rejectReason', { name: firstName })}</label>
            <input
              id={`reject-note-${r.id}`}
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('timeOff.team.rejectPlaceholder')}
            />
          </div>
          <div className="to-ap-actions">
            <button type="button" className="btn-danger btn-md" disabled={busy} onClick={() => decide('rejected')}>
              {t('timeOff.team.confirmReject')}
            </button>
            <button type="button" className="btn-secondary btn-md" disabled={busy} onClick={() => setRejecting(false)}>
              {t('timeOff.team.back')}
            </button>
          </div>
        </div>
      ) : (
        <div className="to-ap-actions">
          <button type="button" className="btn-primary btn-md" disabled={busy} onClick={() => decide('approved')}>
            {t('timeOff.team.approveDays', { count: r.daysRequested })}
          </button>
          <button type="button" className="btn-secondary btn-md" disabled={busy} onClick={() => setRejecting(true)}>
            {t('timeOff.team.reject')}
          </button>
          {!compact && (
            <button type="button" className="to-link ml-auto" onClick={() => onOpenPerson(r.employeeId)}>
              {t('timeOff.team.viewBalance')}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
