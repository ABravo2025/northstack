import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { useToast } from '../components/ToastProvider';

interface OverviewPageProps {
  token: string;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function buildMonthGrid(year: number, month: number): (number | null)[][] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export default function OverviewPage({ token }: OverviewPageProps) {
  const toast = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  useEffect(() => {
    loadCalendar();
  }, []);

  const loadCalendar = async () => {
    setLoading(true);
    try {
      const data = await api.listPtoRequests(token, 'calendar');
      setRequests(data);
    } catch (error) {
      toast.error('Failed to load the team calendar: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);

  const requestsByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (let week = 0; week < grid.length; week++) {
      for (const day of grid[week]) {
        if (day === null) continue;
        const key = dateKey(cursor.year, cursor.month, day);
        map[key] = requests.filter((r) => key >= r.startDate.slice(0, 10) && key <= r.endDate.slice(0, 10));
      }
    }
    return map;
  }, [grid, requests, cursor]);

  const goToPrevMonth = () => {
    setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }));
  };

  const goToNextMonth = () => {
    setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }));
  };

  const goToToday = () => {
    const now = new Date();
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
  };

  const todayKey = (() => {
    const now = new Date();
    return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  })();

  return (
    <div>
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="mb-0">
            {MONTH_LABELS[cursor.month]} {cursor.year}
          </h3>
          <div className="flex items-center gap-1.5">
            <button className="btn-secondary px-2 py-1 text-xs" onClick={goToPrevMonth}>
              ‹
            </button>
            <button className="btn-secondary px-2 py-1 text-xs" onClick={goToToday}>
              Today
            </button>
            <button className="btn-secondary px-2 py-1 text-xs" onClick={goToNextMonth}>
              ›
            </button>
          </div>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <table className="calendar-table">
            <thead>
              <tr>
                {WEEKDAY_LABELS.map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((week, i) => (
                <tr key={i}>
                  {week.map((day, j) => {
                    if (day === null) return <td key={j} className="calendar-cell-empty"></td>;
                    const key = dateKey(cursor.year, cursor.month, day);
                    const dayRequests = requestsByDay[key] || [];
                    return (
                      <td key={j} className={key === todayKey ? 'calendar-cell calendar-cell-today' : 'calendar-cell'}>
                        <div className="calendar-cell-date">{day}</div>
                        {dayRequests.map((req) => (
                          <div
                            key={req.id}
                            className={
                              req.status === 'pending' ? 'calendar-entry calendar-entry-pending' : 'calendar-entry'
                            }
                            title={`${req.employee.firstName} ${req.employee.lastName} — ${req.ptoPolicy.name}${req.status === 'pending' ? ' (pending)' : ''}`}
                          >
                            <span
                              style={{
                                display: 'inline-block',
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: req.ptoPolicy.color || '#9ca3af',
                                marginRight: 4,
                              }}
                            ></span>
                            {req.employee.firstName} {req.employee.lastName[0]}.
                            {req.status === 'pending' ? ' (pending)' : ''}
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
