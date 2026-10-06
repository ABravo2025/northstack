import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Shift, TimeOffHoliday } from '../../api';
import { addDays, formatDay, formatMinute } from '../../lib/shiftDates';
import { shiftTone } from './ShiftCard';

interface ShiftMonthViewProps {
  // Whole weeks covering the month (5 or 6 rows of 7).
  gridDays: string[];
  month: string; // "YYYY-MM"
  shifts: Shift[];
  holidays: TimeOffHoliday[];
  today: string;
  showLocation: boolean;
  onOpen: (shift: Shift) => void;
  onOpenDay: (date: string) => void;
  onCreateAt: ((date: string, minute: number) => void) | null;
}

// Row height taken by the day number line and the "+N more" link; each chip is ~22px.
const DAY_CHROME_PX = 54;
const CHIP_PX = 27;
const MIN_ROW_PX = 96;
const BOTTOM_RESERVE_PX = 64;
const DEFAULT_START = 9 * 60;

// Shifts → Schedule, Month view (Alejandro, 2026-10-06): the month as a grid of days, each shift a
// one-line chip. Fills the window's height like the Day/Week calendar; "+N more" and the day
// number open that day in the Day view.
export default function ShiftMonthView({ gridDays, month, shifts, holidays, today, showLocation, onOpen, onOpenDay, onCreateAt }: ShiftMonthViewProps) {
  const { t, i18n } = useTranslation('shifts');
  const gridRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(600);
  const rows = gridDays.length / 7;

  useLayoutEffect(() => {
    const measure = () => {
      const el = gridRef.current;
      if (!el) return;
      setAvailable(window.innerHeight - (el.getBoundingClientRect().top + window.scrollY) - BOTTOM_RESERVE_PX);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const rowPx = Math.max(MIN_ROW_PX, available / rows);
  // As many chips as fit the row; the rest go under "+N more".
  const maxChips = Math.max(1, Math.floor((rowPx - DAY_CHROME_PX) / CHIP_PX));

  const holidayOn = (date: string) => holidays.find((h) => h.date.slice(0, 10) === date);
  const weekdayNames = gridDays.slice(0, 7).map((d) => formatDay(d, i18n.language, { weekday: 'short' }));

  return (
    <div className="sh-month">
      <div className="sh-month-head">
        {weekdayNames.map((n, i) => (
          <div key={i} className="capitalize">
            {n}
          </div>
        ))}
      </div>
      <div className="sh-month-grid" ref={gridRef} style={{ gridTemplateRows: `repeat(${rows}, ${rowPx}px)` }}>
        {gridDays.map((d) => {
          const dayShifts = shifts.filter((s) => s.date === d).sort((a, b) => a.startMinute - b.startMinute);
          const holiday = holidayOn(d);
          const outside = !d.startsWith(month);
          return (
            <div
              key={d}
              className={`sh-month-day ${outside ? 'sh-outside' : ''} ${d === today ? 'sh-today' : ''} ${onCreateAt ? 'sh-cal-day-clickable' : ''}`}
              onClick={() => onCreateAt?.(d, DEFAULT_START)}
              title={onCreateAt ? t('schedule.clickToAdd') : undefined}
            >
              <div className="sh-month-daytop">
                <button
                  type="button"
                  className="sh-month-num"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDay(d);
                  }}
                  aria-label={formatDay(d, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}
                >
                  {Number(d.slice(8, 10))}
                </button>
                {holiday && (
                  <span className="sh-holiday" title={holiday.name}>
                    {holiday.name}
                  </span>
                )}
              </div>
              {dayShifts.slice(0, maxChips).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`sh-chip sh-${shiftTone(s)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(s);
                  }}
                >
                  <b>{formatMinute(s.startMinute)}</b> {[showLocation ? s.location.name : null, s.position].filter(Boolean).join(' · ') || s.location.name}
                </button>
              ))}
              {dayShifts.length > maxChips && (
                <button
                  type="button"
                  className="sh-month-more"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDay(d);
                  }}
                >
                  {t('schedule.more', { count: dayShifts.length - maxChips })}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Whole weeks (starting on the company's week start) that cover the month of `anyDay`.
export function monthGrid(anyDay: string, weekStartsOn: number): string[] {
  const first = `${anyDay.slice(0, 7)}-01`;
  const lastDate = new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const startOffset = (new Date(`${first}T00:00:00Z`).getUTCDay() - weekStartsOn + 7) % 7;
  const gridStart = addDays(first, -startOffset);
  const days: string[] = [];
  for (let d = gridStart; d <= lastDate || days.length % 7 !== 0; d = addDays(d, 1)) days.push(d);
  return days;
}
