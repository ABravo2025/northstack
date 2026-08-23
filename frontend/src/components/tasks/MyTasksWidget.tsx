import { useEffect, useRef, useState } from 'react';
import { api, type Task } from '../../api';
import { useToast } from '../common/ToastProvider';
import TaskFormPopover, { type TaskFormPayload } from './TaskFormPopover';

interface TenantUserLite {
  id: string;
  firstName: string;
  lastName: string;
}

interface MyTasksWidgetProps {
  token: string;
  tenantUsers: TenantUserLite[];
  currentUserId: string;
}

// "My tasks" widget on /overview (item 11, Módulo de Tasks): assigned-to-me
// tasks, pending first, soonest due date first — same list the "mine"
// endpoint already sorts server-side (taskService.ts, listMyTasks). Rows open
// the same edit popover as EntityTasksList (via the shared TaskFormPopover),
// not a separate implementation.
export default function MyTasksWidget({ token, tenantUsers, currentUserId }: MyTasksWidgetProps) {
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    try {
      const result = await api.listMyTasks(token);
      setTasks(result);
    } catch (error) {
      toast.error('Failed to load your tasks: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggle = async (task: Task) => {
    try {
      await api.updateTask(token, task.id, { completedAt: task.completedAt ? null : new Date().toISOString() });
      await load();
    } catch (error) {
      toast.error('Failed to update task: ' + (error as Error).message);
    }
  };

  const openEditForm = (e: React.MouseEvent<HTMLDivElement>, task: Task) => {
    anchorRef.current = e.currentTarget;
    setEditingTask(task);
    setFormOpen(true);
  };

  const handleSubmit = async (payload: TaskFormPayload) => {
    if (!editingTask) return;
    try {
      await api.updateTask(token, editingTask.id, payload);
      toast.success('Task updated.');
      setFormOpen(false);
      await load();
    } catch (error) {
      toast.error('Failed to save task: ' + (error as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!editingTask) return;
    try {
      await api.deleteTask(token, editingTask.id);
      toast.success('Task deleted.');
      setFormOpen(false);
      await load();
    } catch (error) {
      toast.error('Failed to delete task: ' + (error as Error).message);
    }
  };

  return (
    <div className="card">
      <h3 className="card-title">My tasks</h3>
      {loading && <p className="text-xs text-gray-400">Loading…</p>}
      {!loading && tasks.length === 0 && <p className="text-xs text-gray-400">Nothing assigned to you.</p>}
      <div className="task-list">
        {tasks.map((task) => (
          <div key={task.id} className="task-row task-row-clickable" onClick={(e) => openEditForm(e, task)}>
            <input
              type="checkbox"
              className="task-checkbox"
              checked={!!task.completedAt}
              onClick={(e) => e.stopPropagation()}
              onChange={() => handleToggle(task)}
              aria-label={task.completedAt ? 'Mark as pending' : 'Mark as complete'}
            />
            <div className="min-w-0 flex-1">
              <div className="task-row-title" style={{ display: 'block' }}>
                {task.title}
              </div>
              {task.entitySummary && <div className="text-xs text-gray-400 truncate">{task.entitySummary}</div>}
            </div>
            {task.dueDate && <span className="task-row-date">{new Date(task.dueDate).toLocaleDateString()}</span>}
          </div>
        ))}
      </div>

      <TaskFormPopover
        open={formOpen}
        onClose={() => setFormOpen(false)}
        anchorRef={anchorRef}
        tenantUsers={tenantUsers}
        task={editingTask}
        defaultAssigneeId={currentUserId}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
      />
    </div>
  );
}
