import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Shift, TimeOffHoliday } from '../../api';
import { addDays, formatDay, formatMinute } from '../../lib/shiftDates';
import { shiftTone } from './ShiftCard';

interface ShiftWeekCalendarProps {
  // One day (Day view) or seven (Week view).
  days: string[];
  // The range's shifts plus the day before's overnight ones (their after-midnight part lands on
  // the first column).
  shifts: Shift[];
  holidays: TimeOffHoliday[];
  today: string;
  showLocation: boolean;
  onOpen: (shift: Shift) => void;
  // null when the viewer can't schedule anything — empty slots aren't clickable then.
  onCreateAt: ((date: string, minute: number) => void) | null;
}

// The calendar fills the window's height with no scroll box of its own (Alejandro, 2026-10-06):
// the hours shown are stretched or squeezed to fit, never below MIN_HOUR_PX (below that the page
// itself scrolls, like any other page).
const MIN_HOUR_PX = 22;
const MAX_HOUR_PX = 64;
const SNAP_MINUTES = 30;
const DEFAULT_FIRST_HOUR = 6;
const DEFAULT_LAST_HOUR = 22;
// Space kept under the calendar for the legend and the page's bottom padding.
const BOTTOM_RESERVE_PX = 64;

interface Segment {
  shift: Shift;
  day: string;
  start: number; // minutes into this day
  end: number;
  continuesFromPrev: boolean;
  continuesNext: boolean;
  col: number;
  cols: number;
}

// An overnight shift is drawn in two pieces: until midnight on its own day, and from midnight on
// the next one.
function segmentsFor(shift: Shift, days: string[]): Omit<Segment, 'col' | 'cols'>[] {
  const out: Omit<Segment, 'col' | 'cols'>[] = [];
  if (days.includes(shift.date)) {
    out.push({ shift, day: shift.date, start: shift.startMinute, end: shift.endsNextDay ? 1440 : shift.endMinute, continuesFromPrev: false, continuesNext: shift.endsNextDay });
  }
  const next = addDays(shift.date, 1);
  if (shift.endsNextDay && shift.endMinute > 0 && days.includes(next)) {
    out.push({ shift, day: next, start: 0, end: shift.endMinute, continuesFromPrev: true, continuesNext: false });
  }
  return out;
}

// Google-Calendar style packing: overlapping shifts in a day share its width side by side. Each
// cluster of mutually-overlapping segments gets as many columns as it needs at its busiest.
export function layoutDay(segments: Omit<Segment, 'col' | 'cols'>[]): Segment[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start || b.end - a.end);
  const result: Segment[] = [];
  let cluster: Segment[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((s) => s.col + 1));
    for (const s of cluster) s.cols = cols;
    result.push(...cluster);
    cluster = [];
  };
  for (const seg of sorted) {
    if (cluster.length > 0 && seg.start >= clusterEnd) flush();
    const columnEnds: number[] = [];
    for (const s of cluster) columnEnds[s.col] = Math.max(columnEnds[s.col] ?? 0, s.end);
    let col = columnEnds.findIndex((end) => end === undefined || end <= seg.start);
    if (col === -1) col = columnEnds.length;
    cluster.push({ ...seg, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, seg.end);
  }
  if (cluster.length > 0) flush();
  return result;
}

// Shifts → Schedule, Day and Week views (Alejandro, 2026-10-05): days across, hours down, each
// shift a block as tall as it lasts. Times are the location's own wall clock.
export default function ShiftWeekCalendar({ days, shifts, holidays, today, showLocation, onOpen, onCreateAt }: ShiftWeekCalendarProps) {
  const { t, i18n } = useTranslation('shifts');
  const bodyRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(640);

  const byDay = useMemo(() => {
    const raw = shifts.flatMap((s) => segmentsFor(s, days));
    return new Map(days.map((day) => [day, layoutDay(raw.filter((r) => r.day === day))]));
  }, [shifts, days]);

  // Hours shown: 06:00–22:00, widened to whatever the shifts in view need (overnight ones make it
  // the whole day).
  const [firstHour, lastHour] = useMemo(() => {
    const segs = [...byDay.values()].flat();
    const first = Math.min(DEFAULT_FIRST_HOUR, ...segs.map((s) => Math.floor(s.start / 60)));
    const last = Math.max(DEFAULT_LAST_HOUR, ...segs.map((s) => Math.ceil(s.end / 60)));
    return [first, last];
  }, [byDay]);
  const hours = lastHour - firstHour;

  // Fill the window from where the calendar starts down to the bottom, re-measured on resize.
  useLayoutEffect(() => {
    const measure = () => {
      const el = bodyRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setAvailable(window.innerHeight - top - BOTTOM_RESERVE_PX);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const hourPx = Math.min(MAX_HOUR_PX, Math.max(MIN_HOUR_PX, available / hours));
  const toPx = (minute: number) => ((minute - firstHour * 60) / 60) * hourPx;

  const createAt = (day: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (!onCreateAt) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = firstHour * 60 + ((e.clientY - rect.top) / hourPx) * 60;
    const minute = Math.floor(raw / SNAP_MINUTES) * SNAP_MINUTES;
    onCreateAt(day, Math.min(Math.max(minute, 0), 1440 - SNAP_MINUTES));
  };

  const holidayOn = (date: string) => holidays.find((h) => h.date.slice(0, 10) === date);
  const columns = { gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(${days.length > 1 ? 120 : 240}px, 1fr))` };
  const minWidth = days.length > 1 ? 900 : undefined;

  return (
    <div className="sh-cal">
      <div className="sh-cal-head" style={{ ...columns, minWidth }}>
        <div className="sh-cal-gutter" />
        {days.map((d) => {
          const holiday = holidayOn(d);
          return (
            <div key={d} className={`sh-cal-dayhead ${d === today ? 'sh-today' : ''}`}>
              <span className="capitalize">{formatDay(d, i18n.language, { weekday: days.length > 1 ? 'short' : 'long' })}</span>
              <b>{formatDay(d, i18n.language, { day: 'numeric', month: 'short' })}</b>
              {holiday && (
                <span className="sh-holiday" title={holiday.name}>
                  {t('schedule.holiday')} · {holiday.name}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="sh-cal-body" ref={bodyRef} style={{ ...columns, minWidth, height: hours * hourPx }}>
        <div className="sh-cal-gutter">
          {Array.from({ length: hours }, (_, i) => firstHour + i).map((h) => (
            // The first line has no label (it's the top edge), as in Google Calendar — a label there
            // crowds the next one when hours are short.
            <span key={h} className="sh-cal-hour" style={{ top: (h - firstHour) * hourPx }}>
              {h === firstHour ? '' : formatMinute(h * 60)}
            </span>
          ))}
        </div>
        {days.map((d) => (
          <div
            key={d}
            className={`sh-cal-day ${d === today ? 'sh-today' : ''} ${onCreateAt ? 'sh-cal-day-clickable' : ''}`}
            style={{ backgroundSize: `100% ${hourPx}px` }}
            onClick={(e) => createAt(d, e)}
            title={onCreateAt ? t('schedule.clickToAdd') : undefined}
          >
            {byDay.get(d)!.map((seg) => {
              const s = seg.shift;
              const top = toPx(seg.start);
              const height = Math.max(toPx(seg.end) - top, MIN_HOUR_PX);
              const sub = [showLocation ? s.location.name : null, s.position].filter(Boolean).join(' · ');
              return (
                <button
                  key={`${s.id}-${seg.day}`}
                  type="button"
                  className={`sh-block sh-${shiftTone(s)} ${seg.continuesFromPrev ? 'sh-block-cont-top' : ''} ${seg.continuesNext ? 'sh-block-cont-bottom' : ''}`}
                  style={{ top, height, left: `calc(${(seg.col / seg.cols) * 100}% + 2px)`, width: `calc(${100 / seg.cols}% - 4px)` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(s);
                  }}
                  aria-label={`${formatMinute(s.startMinute)}–${formatMinute(s.endMinute)} ${s.position ?? s.location.name} · ${t(`status.${s.status}`)}`}
                >
                  <span className="sh-block-time">
                    {formatMinute(s.startMinute)}–{formatMinute(s.endMinute)}
                    {s.endsNextDay && '+1'}
                  </span>
                  {sub && <span className="sh-block-sub">{sub}</span>}
                  {s.assignments.length > 0 && (
                    <span className="sh-block-people">
                      {s.assignments.map((a) => (
                        <span key={a.id} className="sh-person" title={t(`status.${s.status === 'draft' ? 'notNotified' : a.status}`)}>
                          <i className={`sh-dot sh-dot-${s.status === 'draft' ? 'draft' : a.status}`} />
                          <span>
                            {a.employee.firstName} {a.employee.lastName}
                          </span>
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
