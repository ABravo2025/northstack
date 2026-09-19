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

// Soonest due date first, completed pushed to the bottom (no day/week grouping, by design).
// Uses the shared `table full-table` + ghost "Add" row every other list page has.
export default function TaskHubList({ tasks, loading, onToggleComplete, onOpenDetail, onAddTask }: TaskHubListProps) {
  if (loading) return <TableSkeleton rows={6} columns={4} />;

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<TaskCheckIcon />}
        title="No tasks here yet"
        body="Tasks assigned to you or created by you will show up here."
        primaryLabel="Add task"
        onPrimary={onAddTask}
      />
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

  return (
    <div className="full-table-wrap">
      <table className="table full-table !mt-0">
        <colgroup>
          <col style={{ width: 44 }} />
          <col />
          <col style={{ width: 140 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 70 }} />
        </colgroup>
        <thead>
          <tr>
            <th />
            <th>Task</th>
            <th>Relationship</th>
            <th>Created</th>
            <th>Due</th>
            <th>Completed</th>
            <th>Assignee</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((task) => (
            <TaskHubRow key={task.id} task={task} onToggleComplete={onToggleComplete} onOpenDetail={onOpenDetail} />
          ))}
          <tr className="ghost-row">
            <td colSpan={7} className="ghost-row-cell" onClick={onAddTask}>
              <span className="ghost-row-inner">
                <span className="ghost-plus-box">
                  <PlusIcon className="h-3 w-3" />
                </span>
                Add
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
