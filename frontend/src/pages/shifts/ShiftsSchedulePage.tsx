import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type Shift, type ShiftLocation, type ShiftsSettings, type TimeOffHoliday } from '../../api';
import { useToast } from '../../components/common/ToastProvider';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import TableSkeleton from '../../components/common/TableSkeleton';
import { BuildingIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon } from '../../components/common/Icons';
import ShiftCard, { filledSlots } from '../../components/shifts/ShiftCard';
import ShiftDetailModal from '../../components/shifts/ShiftDetailModal';
import ShiftFormModal from '../../components/shifts/ShiftFormModal';
import { addDays, formatDay, formatWeekRange, shiftDurationMinutes, todayString, weekDays, weekStartOf } from '../../lib/shiftDates';

interface ShiftsSchedulePageProps {
  token: string;
}

type ViewMode = 'location' | 'person';
const VIEW_KEY = 'northstack:shifts:view';

function readView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === 'person' ? 'person' : 'location';
  } catch {
    return 'location';
  }
}

// Shifts → Schedule (spec-shifts.md, Unidad 5): the week as a grid, by location or by person.
// Drafts are dashed and reach nobody until published.
export default function ShiftsSchedulePage({ token }: ShiftsSchedulePageProps) {
  const { t, i18n } = useTranslation('shifts');
  const toast = useToast();
  const [settings, setSettings] = useState<ShiftsSettings | null>(null);
  const [locations, setLocations] = useState<ShiftLocation[] | null>(null);
  const [managed, setManaged] = useState<string[]>([]);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState('');
  const [view, setView] = useState<ViewMode>(readView);
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [holidays, setHolidays] = useState<TimeOffHoliday[]>([]);
  const [detail, setDetail] = useState<Shift | null>(null);
  const [form, setForm] = useState<{ shift: Shift | null; locationId: string; date: string } | null>(null);
  const [confirm, setConfirm] = useState<'publish' | 'copy' | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (error: unknown) => toast.error(t('schedule.loadFailed', { message: (error as Error).message }));

  useEffect(() => {
    Promise.all([api.getShiftsSettings(token), api.listShiftLocations(token)])
      .then(([s, l]) => {
        setSettings(s);
        setLocations(l.locations);
        setManaged(l.managedLocationIds);
        // Only the first time: a slow (or repeated) load must not yank the person back to this week
        // after they already moved to another one.
        setWeekStart((prev) => prev ?? weekStartOf(todayString(), s.weekStartsOn));
      })
      .catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const days = useMemo(() => (weekStart ? weekDays(weekStart) : []), [weekStart]);

  // `refresh` keeps the current grid on screen while re-fetching the same week (after publishing or
  // copying), instead of flashing the skeleton and zeroed counters.
  const load = useCallback((refresh = false) => {
    if (!weekStart) return;
    if (!refresh) setShifts(null);
    api
      .listShifts(token, weekStart, addDays(weekStart, 6), locationFilter || undefined)
      .then(setShifts)
      .catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, weekStart, locationFilter]);
  useEffect(() => load(), [load]);

  // Company days off from Settings → Time Off, marked on the day headers.
  useEffect(() => {
    if (!weekStart) return;
    const years = [...new Set([weekStart, addDays(weekStart, 6)].map((d) => Number(d.slice(0, 4))))];
    Promise.all(years.map((y) => api.listTimeOffHolidays(token, y)))
      .then((lists) => setHolidays(lists.flat().filter((h) => h.isOff && h.kind !== 'religious')))
      .catch(() => setHolidays([]));
  }, [token, weekStart]);

  const setViewMode = (mode: ViewMode) => {
    setView(mode);
    try {
      localStorage.setItem(VIEW_KEY, mode);
    } catch {
      // per-viewer convenience only
    }
  };

  const canManage = (locationId: string) => managed.includes(locationId);
  const anyManaged = managed.length > 0;
  const today = todayString();
  const activeLocations = (locations ?? []).filter((l) => l.isActive && (!locationFilter || l.id === locationFilter));
  const visible = shifts ?? [];
  const drafts = visible.filter((s) => s.status === 'draft' && canManage(s.locationId));

  // Header numbers count published shifts only — drafts haven't asked anyone anything yet.
  const live = visible.filter((s) => s.status === 'published');
  const answers = live.flatMap((s) => s.assignments);
  const confirmed = answers.filter((a) => a.status === 'accepted').length;
  const waiting = answers.filter((a) => a.status === 'pending').length;
  const declined = answers.filter((a) => a.status === 'declined').length;
  const open = live.reduce((sum, s) => sum + Math.max(0, s.headcount - filledSlots(s)), 0);
  // Person-hours the plan needs: each shift's length × people needed (or more, if more were put on it).
  const plannedMinutes = visible
    .filter((s) => s.status !== 'cancelled')
    .reduce((sum, s) => sum + shiftDurationMinutes(s.startMinute, s.endMinute) * Math.max(s.headcount, filledSlots(s)), 0);

  const upsert = (saved: Shift | null, removedId?: string) => {
    setShifts((prev) => {
      if (!prev) return prev;
      const without = prev.filter((s) => s.id !== (removedId ?? saved?.id));
      if (!saved || saved.date < (weekStart ?? '') || saved.date > addDays(weekStart ?? '', 6)) return without;
      return [...without, saved].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    });
    setDetail(saved);
  };

  const publishAll = async () => {
    setConfirm(null);
    setBusy(true);
    try {
      const r = await api.publishShifts(token, drafts.map((d) => d.id));
      toast.success(t('schedule.published', { count: r.published }));
      load(true);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const copyWeek = async () => {
    if (!weekStart) return;
    setConfirm(null);
    setBusy(true);
    try {
      const r = await api.copyShiftWeek(token, addDays(weekStart, -7), weekStart, locationFilter || undefined);
      toast.success(r.skippedAssignments > 0 ? t('schedule.copiedSkipped', { count: r.created, skipped: r.skippedAssignments }) : t('schedule.copied', { count: r.created }));
      load(true);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  if (!settings || !locations || !weekStart) return <TableSkeleton />;

  if (locations.filter((l) => l.isActive).length === 0) {
    return (
      <div className="page-full sh-page">
        <div>
          <h2 className="to-title">{t('schedule.title')}</h2>
          <p className="to-subtitle">{t('schedule.subtitle')}</p>
        </div>
        <section className="card rules-card items-start">
          <span className="text-ink-faint dark:text-dark-ink-faint">
            <BuildingIcon className="h-6 w-6" />
          </span>
          <h3 className="card-title">{t('schedule.noLocationsTitle')}</h3>
          <p className="rules-lead">{t('schedule.noLocationsBody')}</p>
          <Link to="/settings/shifts" className="btn-primary">
            {t('schedule.goToSettings')}
          </Link>
        </section>
      </div>
    );
  }

  const holidayOn = (date: string) => holidays.find((h) => h.date.slice(0, 10) === date);
  const dayHeader = (date: string) => {
    const holiday = holidayOn(date);
    return (
      <th key={date} className={date === today ? 'sh-today' : ''} scope="col">
        <span className="capitalize">{formatDay(date, i18n.language, { weekday: 'short' })}</span>
        <b>{formatDay(date, i18n.language, { day: 'numeric', month: 'short' })}</b>
        {holiday && (
          <span className="sh-holiday" title={holiday.name}>
            {t('schedule.holiday')} · {holiday.name}
          </span>
        )}
      </th>
    );
  };

  const shiftsOn = (date: string, match: (s: Shift) => boolean) => visible.filter((s) => s.date === date && match(s));

  // By person: everyone with a shift this week, alphabetically; shifts nobody is on go in a
  // "Not assigned" row at the bottom so open work stays visible.
  const people = (() => {
    const map = new Map<string, string>();
    for (const s of visible) for (const a of s.assignments) map.set(a.employeeId, `${a.employee.firstName} ${a.employee.lastName}`);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  })();

  const addButton = (locationId: string, date: string) =>
    canManage(locationId) ? (
      <button
        type="button"
        className="sh-add"
        onClick={() => setForm({ shift: null, locationId, date })}
        aria-label={t('schedule.addShiftOn', { day: formatDay(date, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }) })}
      >
        + {t('schedule.addShift')}
      </button>
    ) : null;

  return (
    <div className="page-full sh-page">
      <div className="to-head">
        <div>
          <h2 className="to-title">{t('schedule.title')}</h2>
          <p className="to-subtitle">{t('schedule.subtitle')}</p>
        </div>
      </div>

      <div className="sh-kpis">
        <div className="sh-kpi">
          <span className="sh-kpi-label">{t('schedule.kpiConfirmed')}</span>
          <span className="sh-kpi-value">
            {confirmed}
            <small>{t('schedule.kpiConfirmedOf', { total: answers.length })}</small>
          </span>
          <span className="sh-meter" aria-hidden="true">
            {answers.length > 0 && (
              <>
                <span className="bg-emerald-500" style={{ width: `${(confirmed / answers.length) * 100}%` }} />
                <span className="bg-amber-400" style={{ width: `${(waiting / answers.length) * 100}%` }} />
                <span className="bg-red-500" style={{ width: `${(declined / answers.length) * 100}%` }} />
              </>
            )}
          </span>
        </div>
        <div className="sh-kpi">
          <span className="sh-kpi-label">{t('schedule.kpiWaiting')}</span>
          <span className="sh-kpi-value">{waiting}</span>
        </div>
        <div className="sh-kpi">
          <span className="sh-kpi-label">{t('schedule.kpiOpen')}</span>
          <span className={`sh-kpi-value ${open + declined > 0 ? 'text-red-600 dark:text-red-300' : ''}`}>{open}</span>
          <span className="sh-kpi-hint">{t('schedule.kpiOpenHint')}</span>
        </div>
        <div className="sh-kpi">
          <span className="sh-kpi-label">{t('schedule.kpiHours')}</span>
          <span className="sh-kpi-value">
            {Math.round(plannedMinutes / 60)}
            <small>h</small>
          </span>
        </div>
      </div>

      <div className="sh-toolbar">
        <div className="sh-weeknav">
          <button type="button" className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label={t('schedule.prevWeek')}>
            <ChevronLeftIcon />
          </button>
          <span className="sh-weeknav-label num">{formatWeekRange(weekStart, i18n.language)}</span>
          <button type="button" className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label={t('schedule.nextWeek')}>
            <ChevronRightIcon />
          </button>
          {weekStart !== weekStartOf(today, settings.weekStartsOn) && (
            <button type="button" className="btn-secondary ml-1" onClick={() => setWeekStart(weekStartOf(today, settings.weekStartsOn))}>
              {t('schedule.thisWeek')}
            </button>
          )}
        </div>
        {locations.filter((l) => l.isActive).length > 1 && (
          <select id="shifts-location-filter" aria-label={t('form.location')} className="max-w-[14rem]" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
            <option value="">{t('schedule.allLocations')}</option>
            {locations
              .filter((l) => l.isActive)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        )}
        <div className="mini-toggle-row" role="group">
          <button type="button" className={`mini-toggle-opt ${view === 'location' ? 'active' : ''}`} onClick={() => setViewMode('location')}>
            {t('schedule.byLocation')}
          </button>
          <button type="button" className={`mini-toggle-opt ${view === 'person' ? 'active' : ''}`} onClick={() => setViewMode('person')}>
            {t('schedule.byPerson')}
          </button>
        </div>
        <span className="sh-grow" />
        {anyManaged && (
          <>
            <button type="button" className="btn-secondary inline-flex items-center gap-1.5" disabled={busy} onClick={() => setConfirm('copy')}>
              <CopyIcon className="h-4 w-4" />
              {t('schedule.copyWeek')}
            </button>
            <button type="button" className="btn-primary" disabled={busy || drafts.length === 0} onClick={() => setConfirm('publish')}>
              {drafts.length > 0 ? t('schedule.publish', { count: drafts.length }) : t('schedule.publishNone')}
            </button>
          </>
        )}
      </div>

      {shifts === null ? (
        <TableSkeleton />
      ) : (
        <div className="sh-grid-wrap">
          <table className="sh-grid">
            <thead>
              <tr>
                <th className="sh-rowhead" scope="col">
                  {view === 'location' ? t('form.location') : t('detail.people')}
                </th>
                {days.map(dayHeader)}
              </tr>
            </thead>
            <tbody>
              {view === 'location' &&
                activeLocations.map((l) => (
                  <tr key={l.id}>
                    <th className="sh-rowhead" scope="row">
                      <b>{l.name}</b>
                      {l.address}
                    </th>
                    {days.map((d) => (
                      <td key={d} className="sh-cell">
                        <div className="sh-cell-inner">
                          {shiftsOn(d, (s) => s.locationId === l.id).map((s) => (
                            <ShiftCard key={s.id} shift={s} mode="location" onOpen={setDetail} />
                          ))}
                          {addButton(l.id, d)}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              {view === 'person' && (
                <>
                  {people.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-ink-muted dark:text-dark-ink-muted">
                        {t('schedule.noPeopleThisWeek')}
                      </td>
                    </tr>
                  )}
                  {people.map(([id, name]) => (
                    <tr key={id}>
                      <th className="sh-rowhead" scope="row">
                        <b>{name}</b>
                      </th>
                      {days.map((d) => (
                        <td key={d} className="sh-cell">
                          <div className="sh-cell-inner">
                            {shiftsOn(d, (s) => s.assignments.some((a) => a.employeeId === id)).map((s) => (
                              <ShiftCard key={s.id} shift={s} mode="person" onOpen={setDetail} />
                            ))}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                  {visible.some((s) => s.assignments.length === 0) && (
                    <tr>
                      <th className="sh-rowhead" scope="row">
                        <b>{t('schedule.unassigned')}</b>
                      </th>
                      {days.map((d) => (
                        <td key={d} className="sh-cell">
                          <div className="sh-cell-inner">
                            {shiftsOn(d, (s) => s.assignments.length === 0).map((s) => (
                              <ShiftCard key={s.id} shift={s} mode="person" onOpen={setDetail} />
                            ))}
                          </div>
                        </td>
                      ))}
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="sh-legend">
        <span>
          <i className="sh-dot sh-dot-accepted" />
          {t('status.accepted')}
        </span>
        <span>
          <i className="sh-dot sh-dot-pending" />
          {t('status.pending')}
        </span>
        <span>
          <i className="sh-dot sh-dot-declined" />
          {t('status.declined')}
        </span>
        <span>
          <i className="sh-dot sh-dot-draft" />
          {t('schedule.legendDraft')}
        </span>
      </div>

      <ShiftDetailModal
        token={token}
        shift={detail}
        canManage={!!detail && canManage(detail.locationId)}
        onClose={() => setDetail(null)}
        onChanged={upsert}
        onEdit={(s) => {
          setDetail(null);
          setForm({ shift: s, locationId: s.locationId, date: s.date });
        }}
      />
      <ShiftFormModal
        token={token}
        open={form !== null}
        shift={form?.shift ?? null}
        defaults={{ locationId: form?.locationId ?? activeLocations[0]?.id ?? '', date: form?.date ?? weekStart }}
        locations={locations.filter((l) => canManage(l.id))}
        onClose={() => setForm(null)}
        onSaved={(saved) => {
          setForm(null);
          upsert(saved);
        }}
      />
      {confirm === 'publish' && (
        <ConfirmDialog
          title={t('schedule.publishConfirmTitle', { count: drafts.length })}
          message={t('schedule.publishConfirmBody')}
          confirmLabel={t('schedule.publish', { count: drafts.length })}
          onCancel={() => setConfirm(null)}
          onConfirm={publishAll}
        />
      )}
      {confirm === 'copy' && (
        <ConfirmDialog
          title={t('schedule.copyConfirmTitle')}
          message={t('schedule.copyConfirmBody', { range: formatWeekRange(addDays(weekStart, -7), i18n.language) })}
          confirmLabel={t('schedule.copyWeek')}
          onCancel={() => setConfirm(null)}
          onConfirm={copyWeek}
        />
      )}
    </div>
  );
}
