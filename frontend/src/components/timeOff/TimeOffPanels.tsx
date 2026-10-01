import { useTranslation } from 'react-i18next';
import type { TimeOffBalance, TimeOffPolicy, TimeOffRequest } from '../../api';
import RequiredMark from '../common/RequiredMark';
import { getInitials } from '../common/Avatar';
import { ApprovalCard } from './TeamTimeOffView';
import { BalanceMeter, PolicyName, RequestStatusChip, availableDays, countRequestDays, policyColor, useDateRangeFormatter } from './timeOffShared';

// Bodies of the Time Off slide-overs (2026-10 redesign). TimeOffOverviewPage owns the
// SlideOver shell, titles and footers; these render what goes inside.

export function RequestDetailBody({ request: r, approverName }: { request: TimeOffRequest; approverName: string | null }) {
  const { t } = useTranslation('tasks');
  const dates = useDateRangeFormatter();
  const statusLabel = t(`timeOff.status.${r.status}`, { defaultValue: r.status });
  const decider = r.approver ? `${r.approver.firstName} ${r.approver.lastName}` : null;
  const outcome =
    r.status === 'pending'
      ? approverName
        ? t('timeOff.requestDetail.waitingFor', { name: approverName })
        : t('timeOff.requestDetail.waitingGeneric')
      : r.status === 'cancelled'
        ? t('timeOff.requestDetail.cancelledByYou')
        : decider
          ? t('timeOff.requestDetail.decidedBy', { status: statusLabel, name: decider })
          : t('timeOff.requestDetail.decided', { status: statusLabel });

  return (
    <div className="to-panel">
      <RequestStatusChip status={r.status} />
      <div className="to-facts num">
        <div>
          <span>{t('timeOff.requestDetail.days')}</span>
          <strong>{r.daysRequested}</strong>
        </div>
        <div>
          <span>{t('timeOff.requestDetail.dates')}</span>
          <strong>{dates.range(r.startDate, r.endDate)}</strong>
        </div>
      </div>
      {r.note && (
        <div className="to-panel-block">
          <h4>{t('timeOff.requestDetail.yourNote')}</h4>
          <p className="to-muted">{r.note}</p>
        </div>
      )}
      <div className="to-panel-block">
        <h4>{t('timeOff.requestDetail.journey')}</h4>
        <ol className="to-timeline">
          <li className="done">
            <span className="to-tdot" />
            <div>
              {t('timeOff.requestDetail.requested')}
              <small>{dates.long(r.createdAt)}</small>
            </div>
          </li>
          <li className={r.status === 'pending' ? '' : 'done'}>
            <span className="to-tdot" />
            <div>
              {outcome}
              {r.decidedAt && <small>{dates.long(r.decidedAt)}</small>}
              {r.decisionNote && <small>“{r.decisionNote}”</small>}
            </div>
          </li>
        </ol>
      </div>
    </div>
  );
}

export interface NewRequestFormValue {
  timeOffPolicyId: string;
  startDate: string;
  endDate: string;
  note: string;
}

interface NewRequestFormProps {
  value: NewRequestFormValue;
  onChange: (value: NewRequestFormValue) => void;
  onSubmit: (e: React.FormEvent) => void;
  balances: TimeOffBalance[];
}

export const NEW_REQUEST_FORM_ID = 'time-off-request-form';

// Days are counted the way the server does (calendar days, both ends included) so the preview
// matches what lands in the balance.
export function requestFormProblem(value: NewRequestFormValue, balances: TimeOffBalance[], t: (k: string, o?: any) => string) {
  if (value.startDate && value.endDate && value.endDate < value.startDate) return t('timeOff.requestForm.endBeforeStart');
  const days = countRequestDays(value.startDate, value.endDate);
  const bal = balances.find((b) => b.timeOffPolicyId === value.timeOffPolicyId);
  if (bal && days > 0 && days > availableDays(bal)) {
    return t('timeOff.requestForm.overBalance', { available: availableDays(bal), policy: bal.policyName.toLowerCase(), days });
  }
  return null;
}

export function NewRequestForm({ value, onChange, onSubmit, balances }: NewRequestFormProps) {
  const { t } = useTranslation('tasks');
  const days = countRequestDays(value.startDate, value.endDate);
  const bal = balances.find((b) => b.timeOffPolicyId === value.timeOffPolicyId);
  const problem = requestFormProblem(value, balances, t);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form id={NEW_REQUEST_FORM_ID} className="to-panel" onSubmit={onSubmit}>
      <div className="form-group !mb-0">
        <label htmlFor="time-off-request-policy">
          {t('timeOff.requestForm.policy')}
          <RequiredMark />
        </label>
        <select
          id="time-off-request-policy"
          value={value.timeOffPolicyId}
          onChange={(e) => onChange({ ...value, timeOffPolicyId: e.target.value })}
          required
        >
          {balances.map((b) => (
            <option key={b.timeOffPolicyId} value={b.timeOffPolicyId}>
              {t('timeOff.requestForm.policyOption', { name: b.policyName, count: availableDays(b) })}
            </option>
          ))}
        </select>
      </div>
      <div className="to-field-row">
        <div className="form-group !mb-0">
          <label htmlFor="time-off-request-start">
            {t('timeOff.requestForm.from')}
            <RequiredMark />
          </label>
          <input
            id="time-off-request-start"
            type="date"
            min={today}
            value={value.startDate}
            onChange={(e) =>
              onChange({ ...value, startDate: e.target.value, endDate: value.endDate && value.endDate >= e.target.value ? value.endDate : e.target.value })
            }
            required
          />
        </div>
        <div className="form-group !mb-0">
          <label htmlFor="time-off-request-end">
            {t('timeOff.requestForm.to')}
            <RequiredMark />
          </label>
          <input
            id="time-off-request-end"
            type="date"
            min={value.startDate || today}
            value={value.endDate}
            onChange={(e) => onChange({ ...value, endDate: e.target.value })}
            required
          />
        </div>
      </div>
      <div className="to-facts num">
        <div>
          <span>{t('timeOff.requestForm.days')}</span>
          <strong>{days || '—'}</strong>
        </div>
        <div>
          <span>{t('timeOff.requestForm.wouldLeave')}</span>
          <strong>
            {bal ? t('timeOff.requestForm.ofTotal', { left: Math.max(availableDays(bal) - days, 0), total: bal.allocated }) : '—'}
          </strong>
        </div>
      </div>
      {problem ? (
        <p className="field-error" role="alert">
          {problem}
        </p>
      ) : (
        <p className="to-hint">{t('timeOff.requestForm.daysHint')}</p>
      )}
      <div className="form-group !mb-0">
        <label htmlFor="time-off-request-note">{t('timeOff.requestForm.note')}</label>
        <textarea
          id="time-off-request-note"
          rows={3}
          value={value.note}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          placeholder={t('timeOff.requestForm.notePlaceholder')}
        />
      </div>
    </form>
  );
}

interface TeamMemberDetailProps {
  balances: TimeOffBalance[];
  requests: TimeOffRequest[];
  pendingApprovals: TimeOffRequest[];
  onDecide: (requestId: string, status: 'approved' | 'rejected', note?: string) => Promise<void> | void;
}

export function TeamMemberDetailBody({ balances, requests, pendingApprovals, onDecide }: TeamMemberDetailProps) {
  const { t } = useTranslation('tasks');
  const dates = useDateRangeFormatter();
  const year = new Date().getFullYear();
  const history = requests.filter((r) => r.status !== 'pending').sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <div className="to-panel">
      <div className="to-panel-block">
        <h4>{t('timeOff.member.balances', { year })}</h4>
        <div className="to-pol-list">
          {balances.map((b) => (
            <div key={b.timeOffPolicyId} className="to-pol-row num">
              <PolicyName name={b.policyName} color={b.color} />
              <span>
                <b>{availableDays(b)}</b> <span className="to-faint">{t('timeOff.team.ofTotal2', { total: b.allocated })}</span>
              </span>
              <BalanceMeter balance={b} color={policyColor(b.color)} />
            </div>
          ))}
        </div>
      </div>
      {pendingApprovals.length > 0 && (
        <div className="to-panel-block">
          <h4>{t('timeOff.member.awaiting')}</h4>
          {pendingApprovals.map((r) => (
            <ApprovalCard
              key={r.id}
              compact
              request={r}
              balance={balances.find((b) => b.timeOffPolicyId === r.timeOffPolicyId)}
              dateRange={dates.range(r.startDate, r.endDate)}
              onDecide={onDecide}
              onOpenPerson={() => {}}
            />
          ))}
        </div>
      )}
      <div className="to-panel-block">
        <h4>{t('timeOff.member.history')}</h4>
        {history.length === 0 ? (
          <p className="to-muted">{t('timeOff.member.noHistory')}</p>
        ) : (
          <div className="to-hist">
            {history.map((r) => (
              <div key={r.id} className="num">
                <PolicyName name={r.timeOffPolicy.name} color={r.timeOffPolicy.color} />
                <span className="to-muted">
                  {dates.range(r.startDate, r.endDate)} · {r.daysRequested}d
                </span>
                <RequestStatusChip status={r.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface PolicyDetailProps {
  policy: TimeOffPolicy;
  accrualLabel: string;
  assignees: { id: string; firstName: string; lastName: string }[];
  onRemove: (employeeId: string) => void;
  onAssign: () => void;
}

export function PolicyDetailBody({ policy, accrualLabel, assignees, onRemove, onAssign }: PolicyDetailProps) {
  const { t } = useTranslation('tasks');
  return (
    <div className="to-panel">
      <div className="to-facts">
        <div>
          <span>{t('timeOff.policyDetail.accrual')}</span>
          <strong>{accrualLabel}</strong>
        </div>
        <div>
          <span>{t('timeOff.policyDetail.approval')}</span>
          <strong>{policy.requiresApproval ? t('timeOff.policyDetail.approvalYes') : t('timeOff.policyDetail.approvalNo')}</strong>
        </div>
        <div>
          <span>{t('timeOff.policyDetail.pay')}</span>
          <strong>{policy.isPaid ? t('timeOff.policyDetail.paid') : t('timeOff.policyDetail.unpaid')}</strong>
        </div>
        <div>
          <span>{t('timeOff.policyDetail.daysPerYear')}</span>
          <strong className="num">{policy.daysPerYear}</strong>
        </div>
      </div>
      <div className="to-panel-block">
        <h4>
          {t('timeOff.policyDetail.assignedTo')} <span className="to-faint num">{assignees.length}</span>
        </h4>
        {assignees.length === 0 ? (
          <p className="to-muted">{t('timeOff.policyDetail.nobody')}</p>
        ) : (
          <div className="to-assignees">
            {assignees.map((a) => (
              <span key={a.id} className="to-assignee">
                <span className="to-assignee-avatar">{getInitials(a.firstName, a.lastName)}</span>
                {a.firstName} {a.lastName}
                <button
                  type="button"
                  className="to-assignee-remove"
                  onClick={() => onRemove(a.id)}
                  aria-label={t('timeOff.policyDetail.removeAria', { name: `${a.firstName} ${a.lastName}` })}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {policy.isActive && (
          <button type="button" className="btn-secondary btn-md self-start" onClick={onAssign}>
            + {t('timeOff.policyDetail.assignPeople')}
          </button>
        )}
      </div>
    </div>
  );
}
