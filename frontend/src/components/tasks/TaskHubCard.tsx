import { useTranslation } from 'react-i18next';
import type { Task } from '../../api';
import Avatar from '../common/Avatar';
import { TaskCheckIcon } from '../common/Icons';
import { formatHubDate, isOverdue } from '../../lib/taskHubDates';
import { relationshipLabel } from './TaskHubRow';

interface TaskHubCardProps {
  task: Task;
  onToggleComplete: (task: Task) => void;
  onOpenDetail: (task: Task) => void;
}

// One card in the My Tasks hub's Board view (rendered inside the shared KanbanBoard<Task> via
// renderCard) — same circular check + entity-first title as TaskHubRow, plus a Created/Completed
// footnote since the board has no column headers to put those dates in.
export default function TaskHubCard({ task, onToggleComplete, onOpenDetail }: TaskHubCardProps) {
  const { t } = useTranslation('tasks');
  const completed = !!task.completedAt;
  const overdue = !completed && isOverdue(task.dueDate);

  return (
    <div onClick={() => onOpenDetail(task)}>
      <div className="kcard-top">
        <button
          type="button"
          className={`task-check-circle ${completed ? 'done' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleComplete(task);
          }}
          aria-pressed={completed}
          aria-label={completed ? t('myTasks.actions.markPending') : t('myTasks.actions.markComplete')}
        >
          <TaskCheckIcon />
        </button>
        <span className={`kc-name flex-1 ${completed ? 'line-through opacity-60' : ''}`}>
          {task.entitySummary && <span>{task.entitySummary} — </span>}
          <span className="font-normal">{task.title}</span>
        </span>
      </div>
      {task.relationship && (
        <div className="mt-1.5">
          <span className={`task-relationship-chip ${task.relationship}`}>{relationshipLabel(task.relationship)}</span>
        </div>
      )}
      <div className="task-hub-card-dates mt-1.5">
        {t('myTasks.cardDates.created', { date: formatHubDate(task.createdAt) })}
        {completed && task.completedAt ? t('myTasks.cardDates.done', { date: formatHubDate(task.completedAt) }) : ''}
      </div>
      <div className="kcard-foot mt-1.5 justify-between">
        <span className={overdue ? 'text-[10.5px] font-semibold text-red-600 dark:text-red-400' : 'kc-age'}>
          {task.dueDate ? formatHubDate(task.dueDate) : t('myTasks.common.noDueDate')}
        </span>
        {task.assignee && <Avatar firstName={task.assignee.firstName} lastName={task.assignee.lastName} />}
      </div>
    </div>
  );
}
