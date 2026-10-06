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
import ShiftMonthView, { monthGrid } from '../../components/shifts/ShiftMonthView';
import ShiftWeekCalendar from '../../components/shifts/ShiftWeekCalendar';
import { addDays, formatDay, formatWeekRange, shiftDurationMinutes, todayString, weekDays, weekStartOf } from '../../lib/shiftDates';

interface ShiftsSchedulePageProps {
  token: string;
}

// Day / Week / Month are the hourly calendar and the month grid (Alejandro, 2026-10-05/06);
// Person is the week as one row per person.
type ViewMode = 'day' | 'week' | 'month' | 'person';
const VIEW_MODES: ViewMode[] = ['day', 'week', 'month', 'person'];
const VIEW_KEY = 'northstack:shifts:view';
const LOCATION_KEY = 'northstack:shifts:location';

// Per-viewer conveniences only: the page works the same without storage.
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

// Keeps the day of the month (clamped: Jan 31 → Feb 28), so going to next month and back lands on
// the same day — and switching to Week afterwards shows the week you were looking at.
function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

// Shifts → Schedule (spec-shifts.md, Unidad 5). One location at a time or all together. Drafts are
// dashed and reach nobody until published.
export default function ShiftsSchedulePage({ token }: ShiftsSchedulePageProps) {
  const { t, i18n } = useTranslation('shifts');
  const toast = useToast();
  const [settings, setSettings] = useState<ShiftsSettings | null>(null);
  const [locations, setLocations] = useState<ShiftLocation[] | null>(null);
  const [managed, setManaged] = useState<string[]>([]);
  // The day the view is anchored on; the week/month shown is the one containing it.
  const [cursor, setCursor] = useState(todayString);
  const [locationFilter, setLocationFilter] = useState(() => readStored(LOCATION_KEY) ?? '');
  const [view, setView] = useState<ViewMode>(() => {
    const stored = readStored(VIEW_KEY) as ViewMode | null;
    return stored && VIEW_MODES.includes(stored) ? stored : 'week';
  });
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [holidays, setHolidays] = useState<TimeOffHoliday[]>([]);
  const [detail, setDetail] = useState<Shift | null>(null);
  const [form, setForm] = useState<{ shift: Shift | null; locationId: string; date: string; startMinute?: number } | null>(null);
  const [confirm, setConfirm] = useState<'publish' | 'copy' | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (error: unknown) => toast.error(t('schedule.loadFailed', { message: (error as Error).message }));

  useEffect(() => {
    Promise.all([api.getShiftsSettings(token), api.listShiftLocations(token)])
      .then(([s, l]) => {
        setSettings(s);
        setLocations(l.locations);
        setManaged(l.managedLocationIds);
        // A remembered location that no longer exists (or was deactivated) falls back to all.
        setLocationFilter((prev) => (prev && l.locations.some((x) => x.id === prev && x.isActive) ? prev : ''));
      })
      .catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const weekStartsOn = settings?.weekStartsOn ?? 1;
  const weekStart = weekStartOf(cursor, weekStartsOn);
  const month = cursor.slice(0, 7);

  // The days on screen for the current view.
  const days = useMemo(() => {
    if (view === 'day') return [cursor];
    if (view === 'month') return monthGrid(cursor, weekStartsOn);
    return weekDays(weekStart);
  }, [view, cursor, weekStart, weekStartsOn]);
  const rangeStart = days[0];
  const rangeEnd = days[days.length - 1];

  // `refresh` keeps the current view on screen while re-fetching the same range (after publishing
  // or copying), instead of flashing the skeleton and zeroed counters. Loads from the day before:
  // an overnight shift that started then shows on the first day.
  const load = useCallback(
    (refresh = false) => {
      if (!settings) return;
      if (!refresh) setShifts(null);
      api
        .listShifts(token, addDays(rangeStart, -1), rangeEnd, locationFilter || undefined)
        .then(setShifts)
        .catch(fail);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, settings, rangeStart, rangeEnd, locationFilter],
  );
  useEffect(() => load(), [load]);

  // Company days off from Settings → Time Off, marked on the days.
  useEffect(() => {
    const years = [...new Set([rangeStart, rangeEnd].map((d) => Number(d.slice(0, 4))))];
    Promise.all(years.map((y) => api.listTimeOffHolidays(token, y)))
      .then((lists) => setHolidays(lists.flat().filter((h) => h.isOff && h.kind !== 'religious')))
      .catch(() => setHolidays([]));
  }, [token, rangeStart, rangeEnd]);

  const setViewMode = (mode: ViewMode) => {
    setView(mode);
    store(VIEW_KEY, mode);
  };
  const chooseLocation = (id: string) => {
    setLocationFilter(id);
    store(LOCATION_KEY, id);
  };
  const step = (direction: 1 | -1) => {
    if (view === 'day') setCursor(addDays(cursor, direction));
    else if (view === 'month') setCursor(addMonths(cursor, direction));
    else setCursor(addDays(cursor, 7 * direction));
  };

  const canManage = (locationId: string) => managed.includes(locationId);
  const anyManaged = managed.length > 0;
  const today = todayString();
  // The counters cover what the view is about: the day, the week, or the month itself (not the
  // neighbouring days the month grid fills in).
  const [countFrom, countTo] = view === 'month' ? [`${month}-01`, monthGrid(cursor, weekStartsOn).filter((d) => d.startsWith(month)).pop()!] : [rangeStart, rangeEnd];
  const visible = (shifts ?? []).filter((s) => s.date >= countFrom && s.date <= countTo);
  const inRange = (shifts ?? []).filter((s) => s.date >= rangeStart && s.date <= rangeEnd);
  const calendarShifts = (shifts ?? []).filter((s) => s.date >= rangeStart || s.endsNextDay);
  const activeLocations = (locations ?? []).filter((l) => l.isActive);
  const manageableActive = activeLocations.filter((l) => canManage(l.id));
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
      if (!saved || saved.date < addDays(rangeStart, -1) || saved.date > rangeEnd) return without;
      if (locationFilter && saved.locationId !== locationFilter) return without;
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

  if (!settings || !locations) return <TableSkeleton />;

  if (activeLocations.length === 0) {
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

  const rangeLabel =
    view === 'day'
      ? formatDay(cursor, i18n.language, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : view === 'month'
        ? formatDay(`${month}-01`, i18n.language, { month: 'long', year: 'numeric' })
        : formatWeekRange(weekStart, i18n.language);
  const showsToday = today >= rangeStart && today <= rangeEnd && (view !== 'month' || today.startsWith(month));

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

  const shiftsOn = (date: string, match: (s: Shift) => boolean) => inRange.filter((s) => s.date === date && match(s));

  // By person: everyone with a shift this week, alphabetically; shifts nobody is on go in a
  // "Not assigned" row at the bottom so open work stays visible.
  const people = (() => {
    const map = new Map<string, string>();
    for (const s of inRange) for (const a of s.assignments) map.set(a.employeeId, `${a.employee.firstName} ${a.employee.lastName}`);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  })();

  // Clicking an empty slot: that day and time, at the location being viewed (or the first one this
  // person can schedule when viewing all). The form lets them pick any other.
  const createAt =
    manageableActive.length > 0
      ? (date: string, startMinute: number) => {
          const locationId = locationFilter && canManage(locationFilter) ? locationFilter : manageableActive[0].id;
          setForm({ shift: null, locationId, date, startMinute });
        }
      : null;
  const showLocation = !locationFilter && activeLocations.length > 1;

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
          <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label={t(`schedule.prev.${view}`)}>
            <ChevronLeftIcon />
          </button>
          <span className="sh-weeknav-label num capitalize">{rangeLabel}</span>
          <button type="button" className="icon-btn" onClick={() => step(1)} aria-label={t(`schedule.next.${view}`)}>
            <ChevronRightIcon />
          </button>
          {!showsToday && (
            <button type="button" className="btn-secondary ml-1" onClick={() => setCursor(today)}>
              {t('schedule.today')}
            </button>
          )}
        </div>
        {activeLocations.length > 1 && (
          <select id="shifts-location-filter" aria-label={t('form.location')} className="h-9 max-w-[14rem] !py-0 text-[13px]" value={locationFilter} onChange={(e) => chooseLocation(e.target.value)}>
            <option value="">{t('schedule.allLocations')}</option>
            {activeLocations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        <div className="mini-toggle-row" role="group" aria-label={t('schedule.viewLabel')}>
          {VIEW_MODES.map((mode) => (
            <button key={mode} type="button" className={`mini-toggle-opt ${view === mode ? 'active' : ''}`} onClick={() => setViewMode(mode)}>
              {t(`schedule.views.${mode}`)}
            </button>
          ))}
        </div>
        <span className="sh-grow" />
        {anyManaged && (
          <>
            {createAt && (
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => createAt(showsToday ? today : view === 'month' ? `${month}-01` : rangeStart, 9 * 60)}>
                + {t('schedule.addShift')}
              </button>
            )}
            {(view === 'week' || view === 'person') && (
              <button type="button" className="btn-secondary inline-flex items-center gap-1.5" disabled={busy} onClick={() => setConfirm('copy')}>
                <CopyIcon className="h-4 w-4" />
                {t('schedule.copyWeek')}
              </button>
            )}
            <button type="button" className="btn-primary" disabled={busy || drafts.length === 0} onClick={() => setConfirm('publish')}>
              {drafts.length > 0 ? t('schedule.publish', { count: drafts.length }) : t('schedule.publishNone')}
            </button>
          </>
        )}
      </div>

      {shifts === null ? (
        <TableSkeleton />
      ) : view === 'day' || view === 'week' ? (
        <ShiftWeekCalendar
          key={view}
          days={days}
          shifts={calendarShifts}
          holidays={holidays}
          today={today}
          showLocation={showLocation}
          onOpen={setDetail}
          onCreateAt={createAt}
        />
      ) : view === 'month' ? (
        <ShiftMonthView
          gridDays={days}
          month={month}
          shifts={inRange}
          holidays={holidays}
          today={today}
          showLocation={showLocation}
          onOpen={setDetail}
          onOpenDay={(d) => {
            setCursor(d);
            setViewMode('day');
          }}
          onCreateAt={createAt}
        />
      ) : (
        <div className="sh-grid-wrap">
          <table className="sh-grid">
            <thead>
              <tr>
                <th className="sh-rowhead" scope="col">
                  {t('detail.people')}
                </th>
                {days.map(dayHeader)}
              </tr>
            </thead>
            <tbody>
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
              {inRange.some((s) => s.assignments.length === 0) && (
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
        defaults={{ locationId: form?.locationId ?? manageableActive[0]?.id ?? '', date: form?.date ?? rangeStart, startMinute: form?.startMinute }}
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
