import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Shift, TimeOffHoliday } from '../../api';
import { addDays, formatDay, formatMinute } from '../../lib/shiftDates';
import { shiftTone } from './ShiftCard';

interface ShiftWeekCalendarProps {
  days: string[];
  // This week's shifts plus the day before's overnight ones (their after-midnight part lands on
  // the first column).
  shifts: Shift[];
  holidays: TimeOffHoliday[];
  today: string;
  showLocation: boolean;
  onOpen: (shift: Shift) => void;
  // null when the viewer can't schedule anything — empty slots aren't clickable then.
  onCreateAt: ((date: string, minute: number) => void) | null;
}

const HOUR_PX = 48;
const MIN_BLOCK_PX = 22;
const SNAP_MINUTES = 30;

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

// Shifts → Schedule as a week calendar (Alejandro, 2026-10-05): days across, hours down, each
// shift a block as tall as it lasts. Times are the location's own wall clock.
export default function ShiftWeekCalendar({ days, shifts, holidays, today, showLocation, onOpen, onCreateAt }: ShiftWeekCalendarProps) {
  const { t, i18n } = useTranslation('shifts');
  const scrollRef = useRef<HTMLDivElement>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Segment[]>();
    for (const day of days) map.set(day, []);
    const raw = shifts.flatMap((s) => segmentsFor(s, days));
    for (const day of days) map.set(day, layoutDay(raw.filter((r) => r.day === day)));
    return map;
  }, [shifts, days]);

  // Open scrolled to just before the earliest shift of the week (07:00 when the week is empty).
  const firstMinute = useMemo(() => {
    const starts = [...byDay.values()].flat().filter((s) => !s.continuesFromPrev).map((s) => s.start);
    return starts.length ? Math.min(...starts) : 7 * 60;
  }, [byDay]);
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    const key = `${days[0]}:${shifts.length > 0}`;
    if (!scrollRef.current || scrolledFor.current === key) return;
    scrolledFor.current = key;
    scrollRef.current.scrollTop = Math.max(0, ((firstMinute - 30) / 60) * HOUR_PX);
  }, [days, shifts.length, firstMinute]);

  const createAt = (day: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (!onCreateAt) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minute = Math.floor(((e.clientY - rect.top) / HOUR_PX) * 60 / SNAP_MINUTES) * SNAP_MINUTES;
    onCreateAt(day, Math.min(Math.max(minute, 0), 1440 - SNAP_MINUTES));
  };

  const holidayOn = (date: string) => holidays.find((h) => h.date.slice(0, 10) === date);

  return (
    <div className="sh-cal">
      <div className="sh-cal-head">
        <div className="sh-cal-gutter" />
        {days.map((d) => {
          const holiday = holidayOn(d);
          return (
            <div key={d} className={`sh-cal-dayhead ${d === today ? 'sh-today' : ''}`}>
              <span className="capitalize">{formatDay(d, i18n.language, { weekday: 'short' })}</span>
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
      <div className="sh-cal-scroll" ref={scrollRef}>
        <div className="sh-cal-body" style={{ height: 24 * HOUR_PX }}>
          <div className="sh-cal-gutter">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="sh-cal-hour" style={{ top: h * HOUR_PX }}>
                {h === 0 ? '' : formatMinute(h * 60)}
              </span>
            ))}
          </div>
          {days.map((d) => (
            <div
              key={d}
              className={`sh-cal-day ${d === today ? 'sh-today' : ''} ${onCreateAt ? 'sh-cal-day-clickable' : ''}`}
              style={{ backgroundSize: `100% ${HOUR_PX}px` }}
              onClick={(e) => createAt(d, e)}
              title={onCreateAt ? t('schedule.clickToAdd') : undefined}
            >
              {byDay.get(d)!.map((seg) => {
                const s = seg.shift;
                const top = (seg.start / 60) * HOUR_PX;
                const height = Math.max(((seg.end - seg.start) / 60) * HOUR_PX, MIN_BLOCK_PX);
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
    </div>
  );
}
