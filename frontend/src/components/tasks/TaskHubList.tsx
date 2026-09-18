import type { Task } from '../../api';
import EmptyState from '../common/EmptyState';
import TableSkeleton from '../common/TableSkeleton';
import { PlusIcon, TaskCheckIcon } from '../common/Icons';
import TaskHubRow from './TaskHubRow';

interface TaskHubListProps {
  tasks: Task[];
  loading: boolean;
  onToggleComplete: (task: Task) => void;
  onOpenDetail: (task: Task) => void;
  onAddTask: () => void;
}

// Flat list, soonest due date first (server-sorted isn't guaranteed for this endpoint since it
// also feeds the Board view — sorted client-side here), completed tasks pushed to the bottom
// rather than grouped under a header (the design review dropped day/week grouping entirely).
export default function TaskHubList({ tasks, loading, onToggleComplete, onOpenDetail, onAddTask }: TaskHubListProps) {
  if (loading) {
    return (
      <div className="task-hub-list">
        <TableSkeleton rows={6} columns={4} />
      </div>
    );
  }

  const sorted = [...tasks].sort((a, b) => {
    const aDone = !!a.completedAt;
    const bDone = !!b.completedAt;
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  if (sorted.length === 0) {
    return (
      <div className="task-hub-list">
        <EmptyState
          icon={<TaskCheckIcon />}
          title="No tasks here yet"
          body="Tasks assigned to you or created by you will show up here."
          primaryLabel="Add task"
          onPrimary={onAddTask}
        />
      </div>
    );
  }

  return (
    <div className="task-hub-list">
      <div className="task-hub-list-header">
        <span className="w-5 shrink-0" />
        <span className="flex-1">Task</span>
        <span className="w-16 shrink-0 text-right">Created</span>
        <span className="w-16 shrink-0 text-right">Due</span>
        <span className="w-16 shrink-0 text-right">Completed</span>
        <span className="w-7 shrink-0" />
      </div>
      {sorted.map((task) => (
        <TaskHubRow key={task.id} task={task} onToggleComplete={onToggleComplete} onOpenDetail={onOpenDetail} />
      ))}
      <button type="button" className="task-hub-row text-ink-faint dark:text-dark-ink-faint" onClick={onAddTask}>
        <PlusIcon className="h-3.5 w-3.5" />
        Add task
      </button>
    </div>
  );
}
