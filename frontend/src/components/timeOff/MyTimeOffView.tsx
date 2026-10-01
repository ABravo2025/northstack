import { useTranslation } from 'react-i18next';
import type { TimeOffBalance, TimeOffRequest } from '../../api';
import TableBody from '../common/TableBody';
import { CalendarIcon } from '../common/Icons';
import { BalanceMeter, PolicyName, RequestStatusChip, availableDays, policyColor, useDateRangeFormatter } from './timeOffShared';

interface MyTimeOffViewProps {
  linked: boolean;
  balances: TimeOffBalance[];
  requests: TimeOffRequest[];
  filterPolicyId: string | null;
  onFilter: (policyId: string | null) => void;
  onOpenRequest: (request: TimeOffRequest) => void;
  onNewRequest: () => void;
}

// "My time off" — replaces the old My Timeoff + My Requests tabs: one card per assigned policy
// (picking one filters the table), then the person's own requests with "+ Request time off" at
// the foot of the table (TableBody standard).
export default function MyTimeOffView({ linked, balances, requests, filterPolicyId, onFilter, onOpenRequest, onNewRequest }: MyTimeOffViewProps) {
  const { t } = useTranslation('tasks');
  const dates = useDateRangeFormatter();
  const year = new Date().getFullYear();

  if (!linked) {
    return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('timeOff.myRequests.notLinked')}</p>;
  }

  const filterPolicy = balances.find((b) => b.timeOffPolicyId === filterPolicyId) ?? null;
  const rows = [...requests]
    .filter((r) => !filterPolicyId || r.timeOffPolicyId === filterPolicyId)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <div className="to-view">
      <div className="to-head">
        <div>
          <h2 className="to-title">{t('timeOff.mine.title')}</h2>
          <p className="to-subtitle">{t('timeOff.mine.subtitle', { year })}</p>
        </div>
      </div>

      {balances.length === 0 ? (
        <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('timeOff.myTimeoff.noPoliciesAssigned')}</p>
      ) : (
        <div className="to-balances">
          {balances.map((b) => {
            const color = policyColor(b.color);
            const selected = filterPolicyId === b.timeOffPolicyId;
            return (
              <button
                key={b.timeOffPolicyId}
                type="button"
                className="to-bal"
                aria-pressed={selected}
                onClick={() => onFilter(selected ? null : b.timeOffPolicyId)}
              >
                <span className="to-bal-top">
                  <PolicyName name={b.policyName} color={b.color} />
                  <span className="to-faint num">{t('timeOff.mine.perYear', { count: b.daysPerYear })}</span>
                </span>
                <span className="to-bal-big num">
                  {availableDays(b)}
                  <small>{t('timeOff.mine.available')}</small>
                </span>
                <BalanceMeter balance={b} color={color} />
                <span className="to-bal-legend num">
                  <span>{t('timeOff.mine.used', { count: b.used })}</span>
                  {b.pending > 0 && <span>{t('timeOff.mine.inReview', { count: b.pending })}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="to-section">
        <div className="to-head">
          <h3 className="to-section-title">
            {t('timeOff.mine.requestsTitle')} <span className="to-faint num">{rows.length}</span>
          </h3>
          {filterPolicy && (
            <span className="to-filter-note">
              {t('timeOff.mine.showing', { policy: filterPolicy.policyName })}
              <button type="button" className="to-link" onClick={() => onFilter(null)}>
                {t('timeOff.mine.showAll')}
              </button>
            </span>
          )}
        </div>
        <div className="full-table-wrap">
          <table className="table full-table !mt-0 to-table">
            <thead>
              <tr>
                <th>{t('timeOff.mine.columns.policy')}</th>
                <th>{t('timeOff.mine.columns.dates')}</th>
                <th>{t('timeOff.mine.columns.days')}</th>
                <th>{t('timeOff.mine.columns.status')}</th>
                <th>{t('timeOff.mine.columns.note')}</th>
              </tr>
            </thead>
            <TableBody
              colSpan={5}
              isEmpty={rows.length === 0}
              empty={{
                icon: <CalendarIcon />,
                title: filterPolicy
                  ? t('timeOff.mine.emptyPolicy', { policy: filterPolicy.policyName.toLowerCase() })
                  : t('timeOff.mine.emptyAll'),
              }}
              onAdd={balances.length > 0 ? onNewRequest : undefined}
              addLabel={t('timeOff.mine.requestDays')}
            >
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="to-row"
                  tabIndex={0}
                  onClick={() => onOpenRequest(r)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenRequest(r);
                    }
                  }}
                >
                  <td>
                    <PolicyName name={r.timeOffPolicy.name} color={r.timeOffPolicy.color} />
                  </td>
                  <td className="num">{dates.range(r.startDate, r.endDate)}</td>
                  <td className="num">{r.daysRequested}</td>
                  <td>
                    <RequestStatusChip status={r.status} />
                  </td>
                  <td className="to-muted to-note-cell">{r.decisionNote || r.note || '—'}</td>
                </tr>
              ))}
            </TableBody>
          </table>
        </div>
      </div>
    </div>
  );
}
