import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type TimeEntry, type TimesheetWeek, type TimeSuggestion } from '../../api';
import { projectsApi } from '../../api/projects';
import { useToast } from '../../components/common/ToastProvider';
import Modal from '../../components/common/Modal';
import TableBody from '../../components/common/TableBody';
import TableSkeleton from '../../components/common/TableSkeleton';
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon, PencilIcon, TrashIcon } from '../../components/common/Icons';
import { usePermissions } from '../../contexts/PermissionsContext';
import { addDays, formatDay, formatDuration, formatWeekRange } from '../../lib/shiftDates';

interface TimesheetPageProps {
  token: string;
}

const STATUS_CHIP = { open: 'to-chip-cancelled', submitted: 'to-chip-pending', approved: 'to-chip-approved', returned: 'to-chip-rejected' } as const;

type Option = { id: string; name: string };
type EntryForm = { id: string | null; date: string; h: string; m: string; description: string; billable: boolean; companyId: string; projectId: string; source?: TimeSuggestion; adjustment?: boolean; sign?: number };

const toMinutes = (h: string, m: string) => (Number(h) || 0) * 60 + (Number(m) || 0);
const splitMinutes = (minutes: number | null) => (minutes === null ? { h: '', m: '' } : { h: String(Math.floor(Math.abs(minutes) / 60)), m: String(Math.abs(minutes) % 60) });

// Shifts → Timesheet (spec-shifts.md, Unidad 11): the person's week — what Northstack suggests
// they worked on (shifts, completed tasks, meetings, Google Calendar), what they logged, and
// submitting it. An approver opening someone else's week (?employee=) gets it read-only with
// Approve / Send back / Reopen.
export default function TimesheetPage({ token }: TimesheetPageProps) {
  const { t, i18n } = useTranslation('shifts');
  const toast = useToast();
  const permissions = usePermissions();
  const [params, setParams] = useSearchParams();
  const employeeId = params.get('employee') ?? undefined;
  const [week, setWeek] = useState<TimesheetWeek | null>(null);
  const [form, setForm] = useState<EntryForm | null>(null);
  const [decision, setDecision] = useState<null | 'return' | 'reopen' | 'adjust' | 'submit'>(null);
  const [note, setNote] = useState('');
  const [adjust, setAdjust] = useState({ sign: '+', h: '', m: '' });
  const [busy, setBusy] = useState(false);
  const [companies, setCompanies] = useState<Option[]>([]);
  const [projects, setProjects] = useState<Option[]>([]);
  const [suggestionMinutes, setSuggestionMinutes] = useState<Record<string, string>>({});

  const load = useCallback(
    (weekStart?: string) =>
      api
        .getTimesheet(token, { weekStart, employeeId })
        .then((w) => {
          setWeek(w);
          setSuggestionMinutes({});
        })
        .catch((error) => toast.error(t('timesheet.loadFailed', { message: (error as Error).message }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, employeeId],
  );

  const weekParam = params.get('week') ?? undefined;
  useEffect(() => {
    void load(weekParam);
  }, [load, weekParam]);

  // Pickers for a manual entry: projects the person can see; companies when they may view them.
  useEffect(() => {
    projectsApi
      .listProjects(token)
      .then((r) => setProjects(r.projects.map((p) => ({ id: p.id, name: p.name }))))
      .catch(() => setProjects([]));
    if (permissions.has('view_company')) {
      api
        .listCompanies(token)
        .then((list) => setCompanies(list.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name))))
        .catch(() => setCompanies([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const goTo = (weekStart: string) => {
    const next = new URLSearchParams(params);
    next.set('week', weekStart);
    setParams(next, { replace: true });
  };

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of week?.entries ?? []) map.set(e.date, (map.get(e.date) ?? 0) + e.minutes);
    return map;
  }, [week]);

  if (!week) {
    return (
      <div className="container sh-page">
        <TableSkeleton rows={6} />
      </div>
    );
  }

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      await load(week.weekStart);
      return true;
    } catch (error) {
      toast.error(t('timesheet.failed', { message: (error as Error).message }));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const dayLabel = (date: string) => formatDay(date, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  const sourceLabel = (source: string) => t(`timesheet.source.${source}`);
  const ownName = `${week.employee.firstName} ${week.employee.lastName}`;

  const addSuggestion = (s: TimeSuggestion) => {
    const typed = suggestionMinutes[`${s.sourceType}:${s.sourceId}`];
    const minutes = typed !== undefined ? Number(typed) : s.minutes;
    if (!minutes || minutes < 1) {
      // No duration known (a task nobody timed): open the form to fill it in.
      setForm({ id: null, date: s.date, h: '', m: '', description: s.title, billable: false, companyId: s.companyId ?? '', projectId: s.projectId ?? '', source: s });
      return;
    }
    void run(
      () => api.addTimeEntry(token, { date: s.date, minutes, description: s.title, source: s.sourceType, sourceId: s.sourceId, companyId: s.companyId, projectId: s.projectId }),
      t('timesheet.added'),
    );
  };

  const addAllTimed = () =>
    run(async () => {
      for (const s of week.suggestions) {
        if (!s.minutes) continue;
        await api.addTimeEntry(token, { date: s.date, minutes: s.minutes, description: s.title, source: s.sourceType, sourceId: s.sourceId, companyId: s.companyId, projectId: s.projectId });
      }
    }, t('timesheet.addedAll'));

  const saveForm = async () => {
    if (!form) return;
    const minutes = toMinutes(form.h, form.m);
    const body = {
      date: form.date,
      minutes,
      description: form.description.trim() || null,
      billable: week.billableAllowed ? form.billable : false,
      companyId: form.companyId || null,
      projectId: form.projectId || null,
    };
    const ok = await run(
      () =>
        form.id
          ? api.updateTimeEntry(token, form.id, form.adjustment ? { minutes: (form.sign ?? 1) * minutes, description: body.description } : body)
          : api.addTimeEntry(token, { ...body, ...(form.source ? { source: form.source.sourceType, sourceId: form.source.sourceId } : {}) }),
      form.id ? t('timesheet.saved') : t('timesheet.added'),
    );
    if (ok) setForm(null);
  };

  const editEntry = (e: TimeEntry) =>
    setForm({
      id: e.id,
      date: e.date,
      ...splitMinutes(e.minutes),
      description: e.description ?? '',
      billable: e.billable,
      companyId: e.companyId ?? '',
      projectId: e.projectId ?? '',
      adjustment: e.source === 'adjustment',
      sign: e.minutes < 0 ? -1 : 1,
    });

  const formMinutes = form ? toMinutes(form.h, form.m) : 0;
  const statusText =
    week.status === 'submitted'
      ? t('timesheet.banner.submitted')
      : week.status === 'approved'
        ? t('timesheet.banner.approved', { name: week.decidedBy ?? '' })
        : week.status === 'returned'
          ? t('timesheet.banner.returned', { name: week.decidedBy ?? '', note: week.decisionNote ?? '' })
          : week.reopenReason
            ? t('timesheet.banner.reopened', { reason: week.reopenReason })
            : null;

  return (
    <div className="container sh-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="to-title">{week.isOwn ? t('timesheet.title') : t('timesheet.titleOf', { name: ownName })}</h2>
          <p className="to-subtitle">{week.isOwn ? t('timesheet.subtitle') : t('timesheet.subtitleOf')}</p>
        </div>
        <div className="sh-weeknav">
          <button type="button" className="icon-btn" aria-label={t('timesheet.prevWeek')} onClick={() => goTo(addDays(week.weekStart, -7))}>
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <span className="sh-weeknav-label">{formatWeekRange(week.weekStart, i18n.language)}</span>
          <button type="button" className="icon-btn" aria-label={t('timesheet.nextWeek')} onClick={() => goTo(addDays(week.weekStart, 7))}>
            <ChevronRightIcon className="h-4 w-4" />
          </button>
          <button type="button" className="btn-secondary !py-1" onClick={() => goTo(week.today)}>
            {t('timesheet.thisWeek')}
          </button>
        </div>
      </div>

      <div className="sh-kpis">
        <div className="sh-kpi">
          <span className="sh-kpi-label">{t('timesheet.logged')}</span>
          <span className="sh-kpi-value">{formatDuration(week.loggedMinutes)}</span>
        </div>
        <div className="sh-kpi">
          <span className="sh-kpi-label">{t('timesheet.planned')}</span>
          <span className="sh-kpi-value">{formatDuration(week.plannedMinutes)}</span>
        </div>
        {week.billableAllowed && (
          <div className="sh-kpi">
            <span className="sh-kpi-label">{t('timesheet.billable')}</span>
            <span className="sh-kpi-value">{formatDuration(week.billableMinutes)}</span>
          </div>
        )}
        <div className="sh-kpi">
          <span className="sh-kpi-label">{t('timesheet.statusLabel')}</span>
          <span className="sh-kpi-value">
            <span className={`to-chip ${STATUS_CHIP[week.status]}`}>{t(`timesheet.status.${week.status}`)}</span>
          </span>
        </div>
      </div>

      {statusText && <p className={`sh-note-box ${week.status === 'returned' ? 'sh-note-warn' : ''}`}>{statusText}</p>}

      {/* The seven days at a glance */}
      <div className="ts-days">
        {week.dates.map((d) => {
          const minutes = byDay.get(d) ?? 0;
          const off = week.timeOffDates.includes(d);
          return (
            <div key={d} className={`ts-day ${d === week.today ? 'ts-day-today' : ''}`}>
              <span className="ts-day-name">{formatDay(d, i18n.language, { weekday: 'short', day: 'numeric' })}</span>
              <span className="ts-day-total">{minutes ? formatDuration(minutes) : '—'}</span>
              {off && <span className="ts-day-off">{t('timesheet.timeOff')}</span>}
            </div>
          );
        })}
      </div>

      {week.canEdit && week.suggestions.length > 0 && (
        <section className="card rules-card">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="card-title">{t('timesheet.suggestions.title')}</h3>
              <p className="rules-lead">{t('timesheet.suggestions.lead')}</p>
            </div>
            {week.suggestions.some((s) => s.minutes) && (
              <button type="button" className="btn-secondary" disabled={busy} onClick={addAllTimed}>
                {t('timesheet.suggestions.addAll')}
              </button>
            )}
          </div>
          <div className="flex flex-col">
            {week.suggestions.map((s) => {
              const key = `${s.sourceType}:${s.sourceId}`;
              return (
                <div key={key} className="ts-suggestion">
                  <span className="ts-suggestion-day">{dayLabel(s.date)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium" title={s.title}>
                      {s.title}
                    </div>
                    <small className="text-ink-muted dark:text-dark-ink-muted">{[sourceLabel(s.sourceType), s.detail].filter(Boolean).join(' · ')}</small>
                  </div>
                  <input
                    type="number"
                    min={1}
                    className="!w-20 !py-1"
                    aria-label={t('timesheet.minutes')}
                    placeholder={t('timesheet.minutesShort')}
                    value={suggestionMinutes[key] ?? (s.minutes ?? '')}
                    onChange={(e) => setSuggestionMinutes({ ...suggestionMinutes, [key]: e.target.value })}
                  />
                  <span className="text-xs text-ink-faint dark:text-dark-ink-faint">min</span>
                  <button type="button" className="btn-primary !px-3 !py-1" disabled={busy} onClick={() => addSuggestion(s)}>
                    {t('timesheet.suggestions.add')}
                  </button>
                  <button
                    type="button"
                    className="to-link text-xs"
                    disabled={busy}
                    onClick={() => run(() => api.dismissTimeSuggestion(token, s.sourceType, s.sourceId), t('timesheet.suggestions.dismissed'))}
                  >
                    {t('timesheet.suggestions.dismiss')}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="card rules-card">
        <h3 className="card-title">{t('timesheet.entries')}</h3>
        <div className="full-table-wrap">
          <table className="table full-table !mt-0 to-table">
            <thead>
              <tr>
                <th>{t('timesheet.col.day')}</th>
                <th>{t('timesheet.col.what')}</th>
                <th>{t('timesheet.col.source')}</th>
                {week.billableAllowed && <th>{t('timesheet.col.billable')}</th>}
                <th>{t('timesheet.col.time')}</th>
                <th aria-label={t('timesheet.col.actions')} />
              </tr>
            </thead>
            <TableBody
              colSpan={week.billableAllowed ? 6 : 5}
              isEmpty={week.entries.length === 0}
              empty={{ icon: <ClockIcon />, title: t('timesheet.emptyTitle'), body: week.canEdit ? t('timesheet.emptyBody') : undefined }}
              onAdd={week.canEdit ? () => setForm({ id: null, date: week.dates.includes(week.today) ? week.today : week.dates[0], h: '', m: '', description: '', billable: false, companyId: '', projectId: '' }) : undefined}
              addLabel={t('timesheet.addEntry')}
            >
              {week.entries.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{dayLabel(e.date)}</td>
                  <td>
                    <div>{e.description ?? '—'}</div>
                    {(e.projectName || e.companyName) && <small className="text-ink-muted dark:text-dark-ink-muted">{[e.projectName, e.companyName].filter(Boolean).join(' · ')}</small>}
                    {e.source === 'adjustment' && (
                      <small className="block text-ink-muted dark:text-dark-ink-muted">
                        {t('timesheet.adjustmentOf', { week: e.adjustsWeekStart ? formatWeekRange(e.adjustsWeekStart, i18n.language) : '—', reason: e.reason ?? '' })}
                      </small>
                    )}
                  </td>
                  <td>{sourceLabel(e.source)}</td>
                  {week.billableAllowed && <td>{e.billable ? <span className="to-chip to-chip-approved">{t('timesheet.yes')}</span> : '—'}</td>}
                  <td className="font-medium whitespace-nowrap">{formatDuration(e.minutes)}</td>
                  <td>
                    {week.canEdit && (
                      <div className="flex justify-end gap-1">
                        <button type="button" className="icon-btn" aria-label={t('timesheet.editEntry')} onClick={() => editEntry(e)}>
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={t('timesheet.deleteEntry')}
                          disabled={busy}
                          onClick={() => run(() => api.deleteTimeEntry(token, e.id), t('timesheet.deleted'))}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </TableBody>
          </table>
        </div>

        {week.adjustedBy.length > 0 && (
          <div className="mt-3">
            <span className="rules-label">{t('timesheet.adjustedBy')}</span>
            <ul className="m-0 mt-1 pl-4 text-sm">
              {week.adjustedBy.map((a) => (
                <li key={a.id}>
                  {formatDuration(a.minutes)} — {a.reason} ({t('timesheet.inWeek', { week: formatWeekRange(a.inWeek, i18n.language), status: t(`timesheet.status.${a.inWeekStatus}`) })})
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {week.canAdjust && (
            <button type="button" className="btn-secondary" onClick={() => { setNote(''); setAdjust({ sign: '+', h: '', m: '' }); setDecision('adjust'); }}>
              {t('timesheet.requestAdjustment')}
            </button>
          )}
          {week.canReopen && (
            <button type="button" className="btn-secondary" onClick={() => { setNote(''); setDecision('reopen'); }}>
              {t('timesheet.reopen')}
            </button>
          )}
          {week.canDecide && (
            <>
              <button type="button" className="btn-secondary" onClick={() => { setNote(''); setDecision('return'); }}>
                {t('timesheet.sendBack')}
              </button>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => run(() => api.decideTimesheet(token, week.timesheetId!, 'approve'), t('timesheet.approvedToast'))}>
                {t('timesheet.approve')}
              </button>
            </>
          )}
          {week.canEdit && (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => setDecision('submit')}>
              {t('timesheet.submit')}
            </button>
          )}
        </div>
      </section>

      {/* Add / edit an entry */}
      <Modal
        open={form !== null}
        title={form?.id ? t('timesheet.editEntry') : t('timesheet.addEntry')}
        onClose={() => setForm(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setForm(null)}>
              {t('form.cancel')}
            </button>
            <button type="submit" form="ts-entry-form" className="btn-primary" disabled={busy || (form?.adjustment ? formMinutes === 0 : formMinutes < 1 || formMinutes > 1440)}>
              {t('timesheet.save')}
            </button>
          </>
        }
      >
        {form && (
          <form
            id="ts-entry-form"
            className="flex flex-col gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void saveForm();
            }}
          >
            {!form.adjustment && (
              <div className="form-group">
                <label htmlFor="ts-date">{t('timesheet.col.day')}</label>
                <select id="ts-date" value={form.date} disabled={!!form.source} onChange={(e) => setForm({ ...form, date: e.target.value })}>
                  {week.dates.map((d) => (
                    <option key={d} value={d}>
                      {dayLabel(d)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group">
              <span className="rules-label">{t('timesheet.col.time')}</span>
              <div className="flex items-center gap-1.5">
                <input id="ts-hours" type="number" min={0} max={24} className="!w-20" aria-label={t('timesheet.hours')} value={form.h} onChange={(e) => setForm({ ...form, h: e.target.value })} autoFocus />
                <span className="text-xs">h</span>
                <input id="ts-minutes" type="number" min={0} max={59} className="!w-20" aria-label={t('timesheet.minutes')} value={form.m} onChange={(e) => setForm({ ...form, m: e.target.value })} />
                <span className="text-xs">min</span>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="ts-description">{t('timesheet.description')}</label>
              <input id="ts-description" value={form.description} maxLength={500} placeholder={t('timesheet.descriptionPlaceholder')} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            {!form.adjustment && projects.length > 0 && (
              <div className="form-group">
                <label htmlFor="ts-project">{t('timesheet.project')}</label>
                <select id="ts-project" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                  <option value="">{t('timesheet.none')}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!form.adjustment && companies.length > 0 && (
              <div className="form-group">
                <label htmlFor="ts-company">{t('timesheet.company')}</label>
                <select id="ts-company" value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
                  <option value="">{t('timesheet.none')}</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!form.adjustment && week.billableAllowed && (
              <label className="rules-switch">
                <input type="checkbox" checked={form.billable} onChange={(e) => setForm({ ...form, billable: e.target.checked })} />
                {t('timesheet.billableToggle')}
              </label>
            )}
          </form>
        )}
      </Modal>

      {/* Submit / send back / reopen / adjustment */}
      <Modal
        open={decision !== null}
        title={decision ? t(`timesheet.dialog.${decision}.title`) : ''}
        onClose={() => setDecision(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDecision(null)}>
              {t('form.cancel')}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || ((decision === 'return' || decision === 'reopen' || decision === 'adjust') && !note.trim()) || (decision === 'adjust' && toMinutes(adjust.h, adjust.m) === 0)}
              onClick={async () => {
                const ok =
                  decision === 'submit'
                    ? await run(() => api.submitTimesheet(token, week.weekStart), t('timesheet.submittedToast'))
                    : decision === 'return'
                      ? await run(() => api.decideTimesheet(token, week.timesheetId!, 'return', note.trim()), t('timesheet.returnedToast'))
                      : decision === 'reopen'
                        ? await run(() => api.reopenTimesheet(token, week.timesheetId!, note.trim()), t('timesheet.reopenedToast'))
                        : await run(
                            () =>
                              api.addTimesheetAdjustment(token, week.timesheetId!, {
                                minutes: (adjust.sign === '-' ? -1 : 1) * toMinutes(adjust.h, adjust.m),
                                reason: note.trim(),
                              }),
                            t('timesheet.adjustedToast'),
                          );
                if (ok) setDecision(null);
              }}
            >
              {decision ? t(`timesheet.dialog.${decision}.confirm`) : ''}
            </button>
          </>
        }
      >
        {decision && (
          <div className="flex flex-col gap-3">
            <p className="m-0">{t(`timesheet.dialog.${decision}.body`, { total: formatDuration(week.loggedMinutes) })}</p>
            {decision === 'adjust' && (
              <div className="flex flex-wrap items-center gap-1.5">
                <select aria-label={t('timesheet.dialog.adjust.direction')} value={adjust.sign} onChange={(e) => setAdjust({ ...adjust, sign: e.target.value })} className="!w-auto">
                  <option value="+">{t('timesheet.dialog.adjust.add')}</option>
                  <option value="-">{t('timesheet.dialog.adjust.remove')}</option>
                </select>
                <input type="number" min={0} className="!w-20" aria-label={t('timesheet.hours')} value={adjust.h} onChange={(e) => setAdjust({ ...adjust, h: e.target.value })} />
                <span className="text-xs">h</span>
                <input type="number" min={0} max={59} className="!w-20" aria-label={t('timesheet.minutes')} value={adjust.m} onChange={(e) => setAdjust({ ...adjust, m: e.target.value })} />
                <span className="text-xs">min</span>
              </div>
            )}
            {decision !== 'submit' && (
              <div className="form-group !mb-0">
                <label htmlFor="ts-note">{t(`timesheet.dialog.${decision}.noteLabel`)}</label>
                <textarea id="ts-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
