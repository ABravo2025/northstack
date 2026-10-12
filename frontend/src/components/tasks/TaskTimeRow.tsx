import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Task } from '../../api';
import { useToast } from '../common/ToastProvider';
import { formatDuration } from '../../lib/shiftDates';

interface TaskTimeRowProps {
  token: string;
  task: Task;
  currentUserId: string;
}

// Time spent on a task (spec-shifts.md Unidad 10), in the task's detail strip: the total, the
// assignee's timer, and a quick edit. The timesheet suggests completed tasks with this time.
export default function TaskTimeRow({ token, task, currentUserId }: TaskTimeRowProps) {
  const { t } = useTranslation('tasks');
  const toast = useToast();
  const [spent, setSpent] = useState<number | null>(task.timeSpentMinutes ?? null);
  const [startedAt, setStartedAt] = useState<string | null>(task.timerStartedAt ?? null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ h: '', m: '' });
  const [, tick] = useState(0);
  const isAssignee = task.assigneeId === currentUserId;

  // Re-render every 30 s while the timer runs, so the running total moves.
  useEffect(() => {
    if (!startedAt) return;
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const running = startedAt ? Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000)) : 0;
  const total = (spent ?? 0) + running;

  const timer = async (action: 'start' | 'stop') => {
    try {
      const updated = await api.setTaskTimer(token, task.id, action);
      setSpent(updated.timeSpentMinutes ?? null);
      setStartedAt(updated.timerStartedAt ?? null);
    } catch (error) {
      toast.error(t('myTasks.time.failed', { message: (error as Error).message }));
    }
  };

  const save = async () => {
    const minutes = (Number(draft.h) || 0) * 60 + (Number(draft.m) || 0);
    try {
      const updated = await api.updateTask(token, task.id, { timeSpentMinutes: draft.h === '' && draft.m === '' ? null : minutes });
      setSpent(updated.timeSpentMinutes ?? null);
      setEditing(false);
    } catch (error) {
      toast.error(t('myTasks.time.failed', { message: (error as Error).message }));
    }
  };

  return (
    <div className="task-hub-detail-row">
      <span className="task-hub-detail-row-label">{t('myTasks.time.label')}</span>
      {editing ? (
        <span className="flex flex-wrap items-center gap-1.5">
          <input
            type="number"
            min={0}
            className="!w-16 !py-1"
            aria-label={t('myTasks.time.hours')}
            value={draft.h}
            onChange={(e) => setDraft({ ...draft, h: e.target.value })}
          />
          <span className="text-xs">h</span>
          <input
            type="number"
            min={0}
            max={59}
            className="!w-16 !py-1"
            aria-label={t('myTasks.time.minutes')}
            value={draft.m}
            onChange={(e) => setDraft({ ...draft, m: e.target.value })}
          />
          <span className="text-xs">min</span>
          <button type="button" className="btn-primary !px-2.5 !py-1 text-xs" onClick={save}>
            {t('myTasks.time.save')}
          </button>
          <button type="button" className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => setEditing(false)}>
            {t('myTasks.time.cancel')}
          </button>
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          <span className={startedAt ? 'font-semibold text-accent dark:text-brand-blue-light' : ''}>
            {spent === null && !startedAt ? '—' : startedAt && total === 0 ? '< 1m' : formatDuration(total)}
            {startedAt && ` · ${t('myTasks.time.running')}`}
          </span>
          {isAssignee && !task.completedAt && (
            <button type="button" className="to-link text-xs" onClick={() => timer(startedAt ? 'stop' : 'start')}>
              {startedAt ? t('myTasks.time.stop') : t('myTasks.time.start')}
            </button>
          )}
          {!startedAt && (
            <button
              type="button"
              className="to-link text-xs"
              onClick={() => {
                setDraft(spent === null ? { h: '', m: '' } : { h: String(Math.floor(spent / 60)), m: String(spent % 60) });
                setEditing(true);
              }}
            >
              {t('myTasks.time.edit')}
            </button>
          )}
        </span>
      )}
    </div>
  );
}
