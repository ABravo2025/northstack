import { useTranslation } from 'react-i18next';
import type { TimeOffBalance, TimeOffLedger, TimeOffPolicy, TimeOffRequest, TimeOffRequestPreview } from '../../api';
import RequiredMark from '../common/RequiredMark';
import { getInitials } from '../common/Avatar';
import { ApprovalCard } from './TeamTimeOffView';
import { BalanceMeter, PolicyName, RequestStatusChip, availableDays, grantedDays, policyColor, useDateRangeFormatter } from './timeOffShared';

// Bodies of the Time Off modals (2026-10 redesign). TimeOffOverviewPage owns the Modal shell,
// titles and footers; these render what goes inside.

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

export const NEW_REQUEST_FORM_ID = 'time-off-request-form';

interface NewRequestFormProps {
  value: NewRequestFormValue;
  onChange: (value: NewRequestFormValue) => void;
  onSubmit: (e: React.FormEvent) => void;
  balances: TimeOffBalance[];
  // The server's count for the current range (company rules: calendar/business days, holidays,
  // company days off, the person's religious holidays) — null while loading or incomplete.
  preview: TimeOffRequestPreview | null;
  previewLoading: boolean;
  previewError: string | null;
}

// Whether the request can be sent as it stands — the same rule the server enforces.
export function requestBlocked(preview: TimeOffRequestPreview | null): boolean {
  return !preview || preview.days === 0 || preview.days > preview.maxRequestable;
}

export function NewRequestForm({ value, onChange, onSubmit, balances, preview, previewLoading, previewError }: NewRequestFormProps) {
  const { t } = useTranslation('tasks');
  const dates = useDateRangeFormatter();
  const today = new Date().toISOString().slice(0, 10);
  const bal = balances.find((b) => b.timeOffPolicyId === value.timeOffPolicyId);
  const reasonLabel = (reason: string, name: string | null) =>
    reason === 'non_working_weekday'
      ? t('timeOff.rules.request.reasonWeekend')
      : name ??
        t(
          reason === 'company'
            ? 'timeOff.rules.request.reasonCompany'
            : reason === 'religious'
              ? 'timeOff.rules.request.reasonReligious'
              : reason === 'non_working'
                ? 'timeOff.rules.request.reasonNonWorking'
                : 'timeOff.rules.request.reasonNational',
        );

  let message: React.ReactNode = <p className="to-hint">{t('timeOff.requestForm.daysHint')}</p>;
  if (previewError) message = <p className="field-error" role="alert">{previewError}</p>;
  else if (preview && preview.days === 0) message = <p className="field-error" role="alert">{t('timeOff.rules.request.nothingToRequest')}</p>;
  else if (preview && preview.days > preview.maxRequestable)
    message = (
      <p className="field-error" role="alert">
        {t('timeOff.rules.request.overBalance', { days: preview.days, max: preview.maxRequestable })}
      </p>
    );
  else if (preview && preview.inAdvance > 0) message = <p className="to-ok">{t('timeOff.rules.request.inAdvance', { count: preview.inAdvance })}</p>;
  else if (preview) message = <p className="to-ok">{t('timeOff.rules.request.enough')}</p>;

  return (
    <form id={NEW_REQUEST_FORM_ID} className="to-panel" onSubmit={onSubmit}>
      <div className="form-group !mb-0">
        <label htmlFor="time-off-request-policy">
          {t('timeOff.requestForm.policy')}
          <RequiredMark />
        </label>
        <select id="time-off-request-policy" value={value.timeOffPolicyId} onChange={(e) => onChange({ ...value, timeOffPolicyId: e.target.value })} required>
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
            onChange={(e) => onChange({ ...value, startDate: e.target.value, endDate: value.endDate && value.endDate >= e.target.value ? value.endDate : e.target.value })}
            required
          />
        </div>
        <div className="form-group !mb-0">
          <label htmlFor="time-off-request-end">
            {t('timeOff.requestForm.to')}
            <RequiredMark />
          </label>
          <input id="time-off-request-end" type="date" min={value.startDate || today} value={value.endDate} onChange={(e) => onChange({ ...value, endDate: e.target.value })} required />
        </div>
      </div>
      <div className="to-facts num">
        <div>
          <span>{t('timeOff.rules.request.deducted')}</span>
          <strong>{previewLoading ? '…' : preview ? preview.days : '—'}</strong>
        </div>
        <div>
          <span>{preview ? t('timeOff.rules.request.wouldLeave') : t('timeOff.rules.request.canRequest')}</span>
          <strong>
            {preview
              ? Math.max(0, Math.round((preview.maxRequestable - preview.days) * 100) / 100)
              : bal
                ? bal.maxRequestable
                : '—'}
          </strong>
        </div>
      </div>
      {preview && <p className="to-hint">{t('timeOff.rules.request.countedAs', { mode: t(preview.dayCount === 'business' ? 'timeOff.rules.request.modeBusiness' : 'timeOff.rules.request.modeCalendar') })}</p>}
      {message}
      {preview && preview.excluded.length > 0 && (
        <div className="to-panel-block">
          <h4>{t('timeOff.rules.request.notDeducted')}</h4>
          <ul className="to-excluded">
            {preview.excluded.map((x) => (
              <li key={x.date}>
                <span className="num">{dates.long(x.date)}</span>
                <span className={`rules-chip ${x.reason === 'company' ? 'rules-chip-company' : x.reason === 'religious' ? 'rules-chip-religious' : x.reason === 'non_working_weekday' ? 'to-chip-cancelled' : 'rules-chip-holiday'}`}>
                  {reasonLabel(x.reason, x.name)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="form-group !mb-0">
        <label htmlFor="time-off-request-note">{t('timeOff.requestForm.note')}</label>
        <textarea id="time-off-request-note" rows={3} value={value.note} onChange={(e) => onChange({ ...value, note: e.target.value })} placeholder={t('timeOff.requestForm.notePlaceholder')} />
      </div>
    </form>
  );
}

interface TeamMemberDetailProps {
  balances: TimeOffBalance[];
  requests: TimeOffRequest[];
  pendingApprovals: TimeOffRequest[];
  ledger: TimeOffLedger | null;
  onDecide: (requestId: string, status: 'approved' | 'rejected', note?: string) => Promise<void> | void;
  // HR only: opens the "Adjust balance" form.
  onAdjust?: () => void;
}

export function TeamMemberDetailBody({ balances, requests, pendingApprovals, ledger, onDecide, onAdjust }: TeamMemberDetailProps) {
  const { t } = useTranslation('tasks');
  const dates = useDateRangeFormatter();
  const year = new Date().getFullYear();
  const history = requests.filter((r) => r.status !== 'pending').sort((a, b) => b.startDate.localeCompare(a.startDate));
  const ledgerItems = ledger
    ? [
        ...ledger.adjustments.map((a) => ({ at: a.createdAt, key: `a-${a.id}`, kind: 'adjustment' as const, a })),
        ...ledger.yearCloses.map((c) => ({ at: `${c.year}-12-31`, key: `c-${c.id}`, kind: 'close' as const, c })),
      ].sort((x, y) => y.at.localeCompare(x.at))
    : [];

  return (
    <div className="to-panel">
      <div className="to-panel-block">
        <div className="to-head">
          <h4>{t('timeOff.member.balances', { year })}</h4>
          {onAdjust && (
            <button type="button" className="btn-secondary btn-sm" onClick={onAdjust}>
              {t('timeOff.rules.adjust.open')}
            </button>
          )}
        </div>
        <div className="to-pol-list">
          {balances.map((b) => (
            <div key={b.timeOffPolicyId} className="to-pol-row num">
              <PolicyName name={b.policyName} color={b.color} />
              <span>
                <b>{availableDays(b)}</b> <span className="to-faint">{t('timeOff.team.ofTotal2', { total: grantedDays(b) })}</span>
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
      {ledger && (
        <div className="to-panel-block">
          <h4>{t('timeOff.rules.ledger.title')}</h4>
          {ledgerItems.length === 0 ? (
            <p className="to-muted">{t('timeOff.rules.ledger.empty')}</p>
          ) : (
            <div className="to-hist">
              {ledgerItems.map((item) =>
                item.kind === 'adjustment' ? (
                  <div key={item.key} className="to-ledger-row">
                    <span>
                      <b className={item.a.days > 0 ? 'to-plus' : 'to-minus'}>
                        {t('timeOff.rules.ledger.adjustment', { sign: item.a.days > 0 ? '+' : '', days: item.a.days, policy: item.a.policyName })}
                      </b>
                      <small>
                        “{item.a.reason}”{item.a.createdByName ? ` · ${t('timeOff.rules.ledger.by', { name: item.a.createdByName })}` : ''}
                      </small>
                    </span>
                    <span className="to-muted num">{dates.long(item.a.createdAt)}</span>
                  </div>
                ) : (
                  <div key={item.key} className="to-ledger-row">
                    <span>
                      <b>{t('timeOff.rules.ledger.yearClose', { year: item.c.year, policy: item.c.policyName })}</b>
                      <small className="num">
                        {t('timeOff.rules.ledger.yearCloseDetail', { unused: item.c.unusedDays, carried: item.c.carriedDays, expired: item.c.expiredDays })}
                      </small>
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface AdjustFormValue {
  timeOffPolicyId: string;
  direction: 'add' | 'remove';
  days: string;
  reason: string;
}

export const ADJUST_FORM_ID = 'time-off-adjust-form';

export function AdjustBalanceForm({
  value,
  onChange,
  onSubmit,
  balances,
}: {
  value: AdjustFormValue;
  onChange: (v: AdjustFormValue) => void;
  onSubmit: (e: React.FormEvent) => void;
  balances: TimeOffBalance[];
}) {
  const { t } = useTranslation('tasks');
  return (
    <form id={ADJUST_FORM_ID} className="to-panel" onSubmit={onSubmit}>
      <div className="form-group !mb-0">
        <label htmlFor="adjust-policy">
          {t('timeOff.rules.adjust.policy')}
          <RequiredMark />
        </label>
        <select id="adjust-policy" value={value.timeOffPolicyId} onChange={(e) => onChange({ ...value, timeOffPolicyId: e.target.value })} required>
          {balances.map((b) => (
            <option key={b.timeOffPolicyId} value={b.timeOffPolicyId}>
              {t('timeOff.requestForm.policyOption', { name: b.policyName, count: availableDays(b) })}
            </option>
          ))}
        </select>
      </div>
      <div className="to-field-row">
        <div className="form-group !mb-0">
          <span className="rules-label">{t('timeOff.rules.adjust.mode')}</span>
          <div className="mini-toggle-row">
            <button type="button" className={`mini-toggle-opt ${value.direction === 'add' ? 'active' : ''}`} onClick={() => onChange({ ...value, direction: 'add' })}>
              {t('timeOff.rules.adjust.add')}
            </button>
            <button type="button" className={`mini-toggle-opt ${value.direction === 'remove' ? 'active' : ''}`} onClick={() => onChange({ ...value, direction: 'remove' })}>
              {t('timeOff.rules.adjust.remove')}
            </button>
          </div>
        </div>
        <div className="form-group !mb-0">
          <label htmlFor="adjust-days">
            {t('timeOff.rules.adjust.days')}
            <RequiredMark />
          </label>
          <input id="adjust-days" type="number" min="0.5" step="0.5" value={value.days} onChange={(e) => onChange({ ...value, days: e.target.value })} required />
        </div>
      </div>
      <div className="form-group !mb-0">
        <label htmlFor="adjust-reason">
          {t('timeOff.rules.adjust.reason')}
          <RequiredMark />
        </label>
        <textarea
          id="adjust-reason"
          rows={2}
          maxLength={300}
          value={value.reason}
          onChange={(e) => onChange({ ...value, reason: e.target.value })}
          placeholder={t('timeOff.rules.adjust.reasonPlaceholder')}
          required
        />
        <p className="to-hint">{t('timeOff.rules.adjust.reasonHint')}</p>
      </div>
    </form>
  );
}

interface PolicyDetailProps {
  policy: TimeOffPolicy;
  accrualLabel: string;
  companyDayCountLabel: string;
  assignees: { id: string; firstName: string; lastName: string }[];
  onRemove: (employeeId: string) => void;
  onAssign: () => void;
}

export function PolicyDetailBody({ policy, accrualLabel, companyDayCountLabel, assignees, onRemove, onAssign }: PolicyDetailProps) {
  const { t } = useTranslation('tasks');
  const dayCountLabel =
    policy.dayCount === 'inherit'
      ? t('timeOff.rules.policy.inherit', { mode: companyDayCountLabel })
      : t(policy.dayCount === 'business' ? 'timeOff.rules.policy.business' : 'timeOff.rules.policy.calendar');
  const unusedLabel =
    policy.unusedAction === 'carry'
      ? policy.carryOverMax != null
        ? t('timeOff.rules.policy.carryUpTo', { count: policy.carryOverMax })
        : t('timeOff.rules.policy.carryAll')
      : t('timeOff.rules.policy.expires');
  return (
    <div className="to-panel">
      <div className="to-facts">
        <div>
          <span>{t('timeOff.policyDetail.accrual')}</span>
          <strong>{accrualLabel}</strong>
        </div>
        <div>
          <span>{t('timeOff.policyDetail.daysPerYear')}</span>
          <strong className="num">{policy.daysPerYear}</strong>
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
          <span>{t('timeOff.rules.policy.factsDayCount')}</span>
          <strong>{dayCountLabel}</strong>
        </div>
        <div>
          <span>{t('timeOff.rules.policy.factsUnused')}</span>
          <strong>{unusedLabel}</strong>
        </div>
        {policy.accrualMethod === 'monthly' && (
          <div>
            <span>{t('timeOff.rules.policy.factsAdvance')}</span>
            <strong>{policy.allowAdvance ? t('timeOff.rules.policy.yes') : t('timeOff.rules.policy.no')}</strong>
          </div>
        )}
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
