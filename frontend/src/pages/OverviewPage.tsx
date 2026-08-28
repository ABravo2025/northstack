import { useState, useEffect, useMemo, useRef } from 'react';
import { api, type EmployeeBirthday, type GoogleCalendarViewEvent, type Task } from '../api';
import { useToast } from '../components/common/ToastProvider';
import TableSkeleton from '../components/common/TableSkeleton';
import { ChevronLeftIcon, ChevronRightIcon } from '../components/common/Icons';
import OnboardingChecklist from '../components/layout/OnboardingChecklist';
import MyTasksWidget from '../components/tasks/MyTasksWidget';
import TaskFormPopover, { type TaskFormPayload } from '../components/tasks/TaskFormPopover';
import NewTaskFromCalendarPopover from '../components/tasks/NewTaskFromCalendarPopover';

interface OverviewPageProps {
  token: string;
  user: any;
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

// A date-only dueDate (exactly UTC midnight, no time ever set — see
// TaskForm.tsx's matching comment) belongs on the day its UTC date portion
// names, unambiguously. A timed dueDate is a real instant, so it has to be
// placed on the *viewer's local* calendar day instead — slicing the UTC
// string directly (as this used to do) put a task assigned late in the day
// in a timezone behind UTC on the wrong (next) day, since the UTC instant
// can already have rolled past midnight.
function taskDueDateKey(iso: string): string {
  const d = new Date(iso);
  const hasTime = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0 || d.getUTCSeconds() !== 0;
  return hasTime ? dateKey(d.getFullYear(), d.getMonth(), d.getDate()) : iso.slice(0, 10);
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

export default function OverviewPage({ token, user }: OverviewPageProps) {
  const toast = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [calendarTasks, setCalendarTasks] = useState<Task[]>([]);
  const [birthdays, setBirthdays] = useState<EmployeeBirthday[]>([]);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarViewEvent[]>([]);
  const [tenantUsers, setTenantUsers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const taskAnchorRef = useRef<HTMLDivElement | null>(null);
  const newTaskAnchorRef = useRef<HTMLTableCellElement | null>(null);
  const [newTaskFormOpen, setNewTaskFormOpen] = useState(false);
  const [newTaskDate, setNewTaskDate] = useState('');

  // 30s polling while the page is open — the only way changes made outside
  // Northstack (e.g. editing a synced Task's event directly in Google
  // Calendar) show up without the user manually reloading, since nothing
  // pushes updates to the browser. Silent: no loading skeleton, no error
  // toast, so a background refresh never interrupts whatever the user is
  // doing — a transient failure just retries on the next tick.
  useEffect(() => {
    loadCalendar();
    api.listTenantUsers(token).then(setTenantUsers).catch(() => {});
    const interval = setInterval(() => {
      refreshCalendarSilently();
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Own effect, keyed on the visible month: unlike the team-wide sources
  // above (Tasks/Time Off/birthdays fetch everything once and filter
  // client-side per day), Google's API needs a bounded time range, so this
  // has to refetch on every month navigation instead. Silent on failure —
  // no Google connection just means nothing extra to show, not an error.
  useEffect(() => {
    const monthStart = new Date(Date.UTC(cursor.year, cursor.month, 1)).toISOString();
    const monthEnd = new Date(Date.UTC(cursor.year, cursor.month + 1, 1)).toISOString();
    api
      .listGoogleCalendarEvents(token, monthStart, monthEnd)
      .then(setGoogleEvents)
      .catch(() => setGoogleEvents([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  const fetchCalendarData = () =>
    Promise.all([
      api.listTimeOffRequests(token, 'calendar'),
      api.listTasksForCalendar(token),
      api.listEmployeeBirthdays(token),
    ]);

  const loadCalendar = async () => {
    setLoading(true);
    try {
      const [data, tasks, employeeBirthdays] = await fetchCalendarData();
      setRequests(data);
      setCalendarTasks(tasks);
      setBirthdays(employeeBirthdays);
    } catch (error) {
      toast.error('Failed to load the team calendar: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const refreshCalendarSilently = async () => {
    try {
      const [data, tasks, employeeBirthdays] = await fetchCalendarData();
      setRequests(data);
      setCalendarTasks(tasks);
      setBirthdays(employeeBirthdays);
    } catch {
      // best-effort — the next 30s tick just tries again
    }
  };

  const openTaskForm = (e: React.MouseEvent<HTMLDivElement>, task: Task) => {
    taskAnchorRef.current = e.currentTarget;
    setEditingTask(task);
    setFormOpen(true);
  };

  const openNewTaskForm = (e: React.MouseEvent<HTMLTableCellElement>, dayKey: string) => {
    newTaskAnchorRef.current = e.currentTarget;
    setNewTaskDate(dayKey);
    setNewTaskFormOpen(true);
  };

  const handleTaskSubmit = async (payload: TaskFormPayload) => {
    if (!editingTask) return;
    try {
      await api.updateTask(token, editingTask.id, payload);
      toast.success('Task updated.');
      setFormOpen(false);
      await loadCalendar();
    } catch (error) {
      toast.error('Failed to save task: ' + (error as Error).message);
    }
  };

  const handleTaskDelete = async () => {
    if (!editingTask) return;
    try {
      await api.deleteTask(token, editingTask.id);
      toast.success('Task deleted.');
      setFormOpen(false);
      await loadCalendar();
    } catch (error) {
      toast.error('Failed to delete task: ' + (error as Error).message);
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

  const tasksByDay = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (let week = 0; week < grid.length; week++) {
      for (const day of grid[week]) {
        if (day === null) continue;
        const key = dateKey(cursor.year, cursor.month, day);
        map[key] = calendarTasks.filter((t) => t.dueDate && taskDueDateKey(t.dueDate) === key);
      }
    }
    return map;
  }, [grid, calendarTasks, cursor]);

  // Birthdays recur every year, so match on month+day only (never the year) —
  // read via UTC getters since birthdate is a plain @db.Date column, serialized
  // as midnight UTC, and a local-time read would roll it back a day west of UTC.
  const birthdaysByDay = useMemo(() => {
    const map: Record<string, EmployeeBirthday[]> = {};
    for (let week = 0; week < grid.length; week++) {
      for (const day of grid[week]) {
        if (day === null) continue;
        const key = dateKey(cursor.year, cursor.month, day);
        map[key] = birthdays.filter((b) => {
          const d = new Date(b.birthdate);
          return d.getUTCMonth() === cursor.month && d.getUTCDate() === day;
        });
      }
    }
    return map;
  }, [grid, birthdays, cursor]);

  const googleEventsByDay = useMemo(() => {
    const map: Record<string, GoogleCalendarViewEvent[]> = {};
    for (let week = 0; week < grid.length; week++) {
      for (const day of grid[week]) {
        if (day === null) continue;
        const key = dateKey(cursor.year, cursor.month, day);
        map[key] = googleEvents.filter((e) => taskDueDateKey(e.start) === key);
      }
    }
    return map;
  }, [grid, googleEvents, cursor]);

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
    <div className="container">
      {(user.role === 'owner' || user.role === 'admin') && <OnboardingChecklist token={token} />}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="page-toolbar">
            <h2>
              {MONTH_LABELS[cursor.month]} {cursor.year}
            </h2>
            <div className="seg-nav ml-auto">
              <button type="button" onClick={goToPrevMonth} aria-label="Previous month">
                <ChevronLeftIcon className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={goToToday}>
                Today
              </button>
              <button type="button" onClick={goToNextMonth} aria-label="Next month">
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-4">
            {loading ? (
              <TableSkeleton rows={5} columns={7} />
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
                        const dayTasks = tasksByDay[key] || [];
                        const dayBirthdays = birthdaysByDay[key] || [];
                        const dayGoogleEvents = googleEventsByDay[key] || [];
                        return (
                          <td
                            key={j}
                            className={key === todayKey ? 'calendar-cell calendar-cell-today' : 'calendar-cell'}
                            onClick={(e) => openNewTaskForm(e, key)}
                            style={{ cursor: 'pointer' }}
                          >
                            <div className="calendar-cell-date">{day}</div>
                            {dayBirthdays.map((b) => (
                              <div
                                key={b.id}
                                className="calendar-entry-birthday"
                                title={`${b.firstName} ${b.lastName}'s birthday`}
                              >
                                🎂 {b.firstName} {b.lastName[0]}.
                              </div>
                            ))}
                            {dayRequests.map((req) => (
                              <div
                                key={req.id}
                                className={
                                  req.status === 'pending' ? 'calendar-entry calendar-entry-pending' : 'calendar-entry'
                                }
                                title={`${req.employee.firstName} ${req.employee.lastName} — ${req.timeOffPolicy.name}${req.status === 'pending' ? ' (pending)' : ''}`}
                              >
                                <span
                                  style={{
                                    display: 'inline-block',
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    background: req.timeOffPolicy.color || '#9ca3af',
                                    marginRight: 4,
                                  }}
                                ></span>
                                {req.employee.firstName} {req.employee.lastName[0]}.
                                {req.status === 'pending' ? ' (pending)' : ''}
                              </div>
                            ))}
                            {dayTasks.map((task) => {
                              const dueDate = task.dueDate ? new Date(task.dueDate) : null;
                              const hasTime =
                                dueDate && (dueDate.getUTCHours() !== 0 || dueDate.getUTCMinutes() !== 0 || dueDate.getUTCSeconds() !== 0);
                              const timeLabel = hasTime
                                ? dueDate!.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                                : null;
                              return (
                                <div
                                  key={task.id}
                                  className="calendar-entry-task"
                                  title={`${timeLabel ? `${timeLabel} — ` : ''}${task.title}${task.entitySummary ? ` — ${task.entitySummary}` : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openTaskForm(e, task);
                                  }}
                                >
                                  {timeLabel && <span className="calendar-entry-task-time">{timeLabel} </span>}
                                  {task.title}
                                </div>
                              );
                            })}
                            {dayGoogleEvents.map((event) => {
                              const eventDate = new Date(event.start);
                              const timeLabel = event.allDay
                                ? null
                                : eventDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                              return (
                                <div
                                  key={event.id}
                                  className="calendar-entry-google"
                                  title={`${timeLabel ? `${timeLabel} — ` : ''}${event.title} (from your Google Calendar)`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {timeLabel && <span className="calendar-entry-task-time">{timeLabel} </span>}
                                  {event.title}
                                </div>
                              );
                            })}
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

        <div className="w-full lg:w-80 lg:shrink-0">
          <MyTasksWidget token={token} tenantUsers={tenantUsers} currentUserId={user.id} />
        </div>
      </div>

      <TaskFormPopover
        open={formOpen}
        onClose={() => setFormOpen(false)}
        anchorRef={taskAnchorRef}
        tenantUsers={tenantUsers}
        task={editingTask}
        defaultAssigneeId={user.id}
        onSubmit={handleTaskSubmit}
        onDelete={handleTaskDelete}
      />

      <NewTaskFromCalendarPopover
        open={newTaskFormOpen}
        onClose={() => setNewTaskFormOpen(false)}
        anchorRef={newTaskAnchorRef}
        token={token}
        tenantUsers={tenantUsers}
        defaultAssigneeId={user.id}
        defaultDueDate={newTaskDate}
        onCreated={refreshCalendarSilently}
      />
    </div>
  );
}
