import { useMemo } from 'react';
import type { Task } from '../../api';
import KanbanBoard, { type KanbanColumn } from '../entity-views/KanbanBoard';
import TaskHubCard from './TaskHubCard';
import { bucketForTask, type TaskBoardBucket } from '../../lib/taskHubDates';

interface TaskHubBoardProps {
  tasks: Task[];
  showCompleted: boolean;
  onToggleComplete: (task: Task) => void;
  onOpenDetail: (task: Task) => void;
  onMoveTask: (task: Task, bucket: TaskBoardBucket) => void;
}

const BASE_COLUMNS: KanbanColumn[] = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'later', label: 'Later' },
  { key: 'nodate', label: 'No due date' },
];

// Reuses the same generic KanbanBoard<T> Opportunities/Companies already use (drag-and-drop,
// column headers, mobile touch handling) — columns here are synthetic date buckets rather than a
// stored per-tenant catalog, since a Task has no status field of its own (see taskHubDates.ts).
export default function TaskHubBoard({ tasks, showCompleted, onToggleComplete, onOpenDetail, onMoveTask }: TaskHubBoardProps) {
  const columns = useMemo(
    () => (showCompleted ? [...BASE_COLUMNS, { key: 'completed', label: 'Completed' }] : BASE_COLUMNS),
    [showCompleted],
  );

  return (
    <KanbanBoard
      columns={columns}
      items={tasks}
      getItemKey={(t) => t.id}
      getItemColumn={(t) => bucketForTask(t.dueDate, t.completedAt)}
      onMove={(task, columnKey) => onMoveTask(task, columnKey as TaskBoardBucket)}
      renderCard={(task) => <TaskHubCard task={task} onToggleComplete={onToggleComplete} onOpenDetail={onOpenDetail} />}
    />
  );
}
