import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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

// Reuses the same generic KanbanBoard<T> Opportunities/Companies already use (drag-and-drop,
// column headers, mobile touch handling) — columns here are synthetic date buckets rather than a
// stored per-tenant catalog, since a Task has no status field of its own (see taskHubDates.ts).
export default function TaskHubBoard({ tasks, showCompleted, onToggleComplete, onOpenDetail, onMoveTask }: TaskHubBoardProps) {
  const { t } = useTranslation('tasks');
  const columns = useMemo(() => {
    const base: KanbanColumn[] = [
      { key: 'overdue', label: t('myTasks.board.overdue') },
      { key: 'today', label: t('myTasks.board.today') },
      { key: 'week', label: t('myTasks.board.thisWeek') },
      { key: 'later', label: t('myTasks.board.later') },
      { key: 'nodate', label: t('myTasks.board.noDueDate') },
    ];
    return showCompleted ? [...base, { key: 'completed', label: t('myTasks.board.completed') }] : base;
  }, [showCompleted, t]);

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
