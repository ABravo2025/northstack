import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Task } from '../../api';
import { useToast } from '../common/ToastProvider';
import { TASK_COMPLETED_EVENT } from '../../lib/duration';

interface TaskTimePromptProps {
  token: string;
  userId: string;
}

const CHOICES = [15, 30, 45, 60, 120];

// "How long did it take?" (spec-shifts.md Unidad 10): a small card, bottom right, after the
// signed-in person completes one of their own tasks anywhere in the app — only when the company
// uses timesheets and nobody has logged time on the task yet (the timer already did). Never
// blocks: ignoring it is the same as skipping.
export default function TaskTimePrompt({ token, userId }: TaskTimePromptProps) {
  const { t } = useTranslation('tasks');
  const toast = useToast();
  const [enabled, setEnabled] = useState(false);
  const [task, setTask] = useState<Task | null>(null);
  const [other, setOther] = useState('');

  useEffect(() => {
    api
      .getShiftsSettings(token)
      .then((s) => setEnabled(s.timesheetEnabled))
      .catch(() => setEnabled(false));
  }, [token]);

  useEffect(() => {
    if (!enabled) return;
    const onCompleted = (e: Event) => {
      const done = (e as CustomEvent<Task>).detail;
      if (done.assigneeId !== userId || (done.timeSpentMinutes ?? null) !== null) return;
      setOther('');
      setTask(done);
    };
    window.addEventListener(TASK_COMPLETED_EVENT, onCompleted);
    return () => window.removeEventListener(TASK_COMPLETED_EVENT, onCompleted);
  }, [enabled, userId]);

  // Goes away on its own after a while; it's a nudge, not a question that must be answered.
  useEffect(() => {
    if (!task) return;
    const id = window.setTimeout(() => setTask(null), 20_000);
    return () => window.clearTimeout(id);
  }, [task]);

  if (!task) return null;

  const save = async (minutes: number) => {
    const id = task.id;
    setTask(null);
    try {
      await api.updateTask(token, id, { timeSpentMinutes: minutes });
      toast.success(t('myTasks.timePrompt.saved'));
    } catch (error) {
      toast.error(t('myTasks.time.failed', { message: (error as Error).message }));
    }
  };

  return (
    <div
      role="dialog"
      aria-label={t('myTasks.timePrompt.question')}
      className="fixed right-4 bottom-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-white p-4 text-sm shadow-lg dark:border-dark-line dark:bg-dark-surface"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 font-semibold">{t('myTasks.timePrompt.question')}</p>
          <p className="m-0 mt-0.5 truncate text-xs text-ink-muted dark:text-dark-ink-muted" title={task.title}>
            {task.title}
          </p>
        </div>
        <button type="button" className="toast-close" aria-label={t('myTasks.timePrompt.skip')} onClick={() => setTask(null)}>
          ×
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {CHOICES.map((m) => (
          <button key={m} type="button" className="sh-template-chip" onClick={() => save(m)}>
            {m < 60 ? `${m} min` : `${m / 60} h`}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const m = Number(other);
          if (Number.isInteger(m) && m > 0) void save(m);
        }}
      >
        <input
          type="number"
          min={1}
          className="!w-24 !py-1"
          placeholder={t('myTasks.timePrompt.otherPlaceholder')}
          aria-label={t('myTasks.timePrompt.otherPlaceholder')}
          value={other}
          onChange={(e) => setOther(e.target.value)}
        />
        <button type="submit" className="btn-secondary !px-2.5 !py-1 text-xs" disabled={!other}>
          {t('myTasks.timePrompt.save')}
        </button>
        <button type="button" className="to-link ml-auto text-xs" onClick={() => setTask(null)}>
          {t('myTasks.timePrompt.skip')}
        </button>
      </form>
    </div>
  );
}
