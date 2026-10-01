import { useTranslation } from 'react-i18next';
import type { Task } from '../../api';
import TableBody from '../common/TableBody';
import TableSkeleton from '../common/TableSkeleton';
import { TaskCheckIcon } from '../common/Icons';
import TaskHubRow from './TaskHubRow';

interface TaskHubListProps {
  tasks: Task[];
  loading: boolean;
  onToggleComplete: (task: Task) => void;
  onOpenDetail: (task: Task) => void;
  onAddTask: () => void;
}

// Soonest due date first, completed pushed to the bottom (no day/week grouping, by design).
// Uses the shared `table full-table` + TableBody (empty row + "+ Add" row) every list page has.
export default function TaskHubList({ tasks, loading, onToggleComplete, onOpenDetail, onAddTask }: TaskHubListProps) {
  const { t } = useTranslation('tasks');
  if (loading) return <TableSkeleton rows={6} columns={4} />;

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
            <th>{t('myTasks.table.task')}</th>
            <th>{t('myTasks.table.relationship')}</th>
            <th>{t('myTasks.table.created')}</th>
            <th>{t('myTasks.table.due')}</th>
            <th>{t('myTasks.table.completed')}</th>
            <th>{t('myTasks.table.assignee')}</th>
          </tr>
        </thead>
        <TableBody
          colSpan={7}
          isEmpty={sorted.length === 0}
          empty={{
            icon: <TaskCheckIcon />,
            title: t('myTasks.emptyState.title'),
            body: t('myTasks.emptyState.body'),
          }}
          onAdd={onAddTask}
          addLabel={t('myTasks.table.add')}
        >
          {sorted.map((task) => (
            <TaskHubRow key={task.id} task={task} onToggleComplete={onToggleComplete} onOpenDetail={onOpenDetail} />
          ))}
        </TableBody>
      </table>
    </div>
  );
}
