import type { Task } from '../../api';
import { TaskCheckIcon } from '../common/Icons';
import { formatHubDate, isOverdue } from '../../lib/taskHubDates';

interface TaskHubRowProps {
  task: Task;
  onToggleComplete: (task: Task) => void;
  onOpenDetail: (task: Task) => void;
}

// One <tr> of the My Tasks List view — built on the same shared `table full-table` styling as
// People/Companies/Contacts (name cell, muted secondary cells, .avatar), so this page doesn't look
// like a different product. The circular check stays its own control (see .task-check-circle).
export default function TaskHubRow({ task, onToggleComplete, onOpenDetail }: TaskHubRowProps) {
  const completed = !!task.completedAt;
  const overdue = !completed && isOverdue(task.dueDate);
  const initials = task.assignee ? `${task.assignee.firstName[0] ?? ''}${task.assignee.lastName[0] ?? ''}`.toUpperCase() : '';

  return (
    <tr className="cursor-pointer" onClick={() => onOpenDetail(task)}>
      <td>
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
      </td>
      <td>
        <span className={`name-cell ${completed ? 'line-through opacity-60' : ''}`}>
          {task.entitySummary && <span>{task.entitySummary}</span>}
          {task.entitySummary && <span className="font-normal">—</span>}
          <span className="font-normal">{task.title}</span>
        </span>
      </td>
      <td>
        {task.relationship && (
          <span className={`task-relationship-chip ${task.relationship}`}>{relationshipLabel(task.relationship)}</span>
        )}
      </td>
      <td>{task.createdAt ? formatHubDate(task.createdAt) : '—'}</td>
      <td className={overdue ? '!font-semibold !text-red-600 dark:!text-red-400' : ''}>
        {task.dueDate ? formatHubDate(task.dueDate) : '—'}
      </td>
      <td>{task.completedAt ? formatHubDate(task.completedAt) : '—'}</td>
      <td>{initials && <span className="avatar">{initials}</span>}</td>
    </tr>
  );
}

export function relationshipLabel(relationship: 'assignee' | 'creator' | 'both'): string {
  if (relationship === 'both') return 'Both';
  return relationship === 'assignee' ? 'Assigned to you' : 'Created by you';
}
