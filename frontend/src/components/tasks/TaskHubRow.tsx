import type { Task } from '../../api';
import Avatar from '../common/Avatar';
import { TaskCheckIcon } from '../common/Icons';
import { formatHubDate, isOverdue } from '../../lib/taskHubDates';

interface TaskHubRowProps {
  task: Task;
  onToggleComplete: (task: Task) => void;
  onOpenDetail: (task: Task) => void;
}

// One row in the My Tasks hub's List view — reused by nothing else (the entity-scoped
// EntityTasksList/MyTasksWidget rows stay on the plain square checkbox + .task-row-date they
// already had; this hub is the one surface with the circular check + Created/Due/Completed
// columns the design review asked for).
export default function TaskHubRow({ task, onToggleComplete, onOpenDetail }: TaskHubRowProps) {
  const completed = !!task.completedAt;
  const overdue = !completed && isOverdue(task.dueDate);

  return (
    <div className="task-hub-row" onClick={() => onOpenDetail(task)}>
      <button
        type="button"
        className={`task-check-circle ${completed ? 'done' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleComplete(task);
        }}
        aria-pressed={completed}
        aria-label={completed ? 'Mark as pending' : 'Mark as complete'}
      >
        <TaskCheckIcon />
      </button>

      <div className="task-hub-row-main">
        <div className={`task-hub-row-title ${completed ? 'done' : ''}`}>
          {task.entitySummary && <span className="entity">{task.entitySummary} — </span>}
          {task.title}
        </div>
        {task.relationship && (
          <div className="mt-0.5">
            <span className={`task-relationship-chip ${task.relationship}`}>{relationshipLabel(task.relationship)}</span>
          </div>
        )}
      </div>

      <div className="task-hub-date-col">{task.createdAt ? formatHubDate(task.createdAt) : '—'}</div>
      <div className={`task-hub-date-col ${overdue ? 'overdue' : ''}`}>{task.dueDate ? formatHubDate(task.dueDate) : 'No due date'}</div>
      <div className={`task-hub-date-col ${completed ? 'done-date' : ''}`}>{task.completedAt ? formatHubDate(task.completedAt) : '—'}</div>

      {task.assignee && <Avatar firstName={task.assignee.firstName} lastName={task.assignee.lastName} />}
    </div>
  );
}

export function relationshipLabel(relationship: 'assignee' | 'creator' | 'both'): string {
  if (relationship === 'both') return 'Both';
  return relationship === 'assignee' ? 'Assigned to you' : 'Created by you';
}
