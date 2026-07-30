import { useEffect, useState } from 'react';
import { api, type Task, type TaskEntityType } from '../../api';
import { useToast } from '../common/ToastProvider';
import TaskForm, { type TaskFormPayload } from './TaskForm';
import Avatar from '../common/Avatar';

interface TenantUserLite {
  id: string;
  firstName: string;
  lastName: string;
}

interface EntityTasksListProps {
  token: string;
  entityType: TaskEntityType;
  entityId: string;
  tenantUsers: TenantUserLite[];
  currentUserId: string;
  // Reported every time the list (re)loads, so the tab this list lives in can
  // show a pending-task count badge without re-fetching itself.
  onCountChange?: (pendingCount: number) => void;
}

// Shared across EmployeeOverviewPanel and the Company/Contact/Opportunity
// detail modals' right-column "Tasks" tab — the piece those 4 containers
// genuinely have in common. Compose form is always expanded (2026-07-30
// redesign) — no more click-to-open Popover, since the right column has a
// dedicated tall spot to put it in.
export default function EntityTasksList({
  token,
  entityType,
  entityId,
  tenantUsers,
  currentUserId,
  onCountChange,
}: EntityTasksListProps) {
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState<Task | null>(null); // null = composing new

  const load = async () => {
    try {
      const result = await api.listTasks(token, entityType, entityId);
      setTasks(result);
      onCountChange?.(result.filter((t) => !t.completedAt).length);
    } catch (error) {
      toast.error('Failed to load tasks: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setEditingTask(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  const handleToggleComplete = async (task: Task) => {
    try {
      await api.updateTask(token, task.id, { completedAt: task.completedAt ? null : new Date().toISOString() });
      await load();
    } catch (error) {
      toast.error('Failed to update task: ' + (error as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!editingTask) return;
    try {
      await api.deleteTask(token, editingTask.id);
      toast.success('Task deleted.');
      setEditingTask(null);
      await load();
    } catch (error) {
      toast.error('Failed to delete task: ' + (error as Error).message);
    }
  };

  const handleSubmit = async (payload: TaskFormPayload) => {
    try {
      if (editingTask) {
        await api.updateTask(token, editingTask.id, payload);
        toast.success('Task updated.');
        setEditingTask(null);
      } else {
        await api.createTask(token, { entityType, entityId, ...payload });
        toast.success('Task created.');
      }
      await load();
    } catch (error) {
      toast.error('Failed to save task: ' + (error as Error).message);
    }
  };

  const pending = tasks.filter((t) => !t.completedAt);
  const completed = tasks.filter((t) => t.completedAt);
  const ordered = [...pending, ...completed];

  return (
    <div className="flex flex-col gap-3">
      <TaskForm
        task={editingTask}
        tenantUsers={tenantUsers}
        defaultAssigneeId={currentUserId}
        onSubmit={handleSubmit}
        onDelete={editingTask ? handleDelete : undefined}
        onCancelEdit={editingTask ? () => setEditingTask(null) : undefined}
      />

      <div className="task-list">
        {loading && <p className="text-xs text-gray-400">Loading tasks…</p>}
        {!loading && ordered.length === 0 && <p className="text-xs text-gray-400">No tasks yet.</p>}
        {ordered.map((task) => (
          <div key={task.id} className={`task-row ${editingTask?.id === task.id ? 'task-row-active' : ''}`}>
            <input
              type="checkbox"
              className="task-checkbox"
              checked={!!task.completedAt}
              onChange={() => handleToggleComplete(task)}
              aria-label={task.completedAt ? 'Mark as pending' : 'Mark as complete'}
            />
            <button
              type="button"
              className={`task-row-title ${task.completedAt ? 'completed' : ''}`}
              onClick={() => setEditingTask(task)}
            >
              {task.title}
            </button>
            {task.dueDate && <span className="task-row-date">{new Date(task.dueDate).toLocaleDateString()}</span>}
            {task.assignee && <Avatar firstName={task.assignee.firstName} lastName={task.assignee.lastName} />}
          </div>
        ))}
      </div>
    </div>
  );
}
