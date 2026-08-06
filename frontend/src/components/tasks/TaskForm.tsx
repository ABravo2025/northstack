import { useEffect, useState } from 'react';
import type { Task } from '../../api';
import RequiredMark from '../common/RequiredMark';
import { TrashIcon, XIcon } from '../common/Icons';

interface TenantUserLite {
  id: string;
  firstName: string;
  lastName: string;
}

export interface TaskFormPayload {
  title: string;
  description: string | null;
  assigneeId: string;
  dueDate: string | null;
}

interface TaskFormProps {
  task: Task | null; // null = composing a new task
  tenantUsers: TenantUserLite[];
  defaultAssigneeId: string;
  onSubmit: (payload: TaskFormPayload) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onCancelEdit?: () => void;
}

// Always-expanded compose form for the right-column "Tasks" tab — no more
// click-to-open Popover (2026-07-30 redesign): the tab has a dedicated, tall
// column to put the form in, so there's no anchoring/positioning to manage
// anymore, and no morphology-jump risk between add/edit like the old popover
// had (D2 fix, now moot).
export default function TaskForm({ task, tenantUsers, defaultAssigneeId, onSubmit, onDelete, onCancelEdit }: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState(defaultAssigneeId);
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setAssigneeId(task?.assigneeId ?? defaultAssigneeId);
    setDueDate(task?.dueDate ? task.dueDate.slice(0, 10) : '');
  }, [task, defaultAssigneeId]);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    const wasNew = !task;
    await onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      assigneeId,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    });
    if (wasNew) {
      setTitle('');
      setDescription('');
      setDueDate('');
      setAssigneeId(defaultAssigneeId);
    }
  };

  return (
    <div className="inline-compose-form">
      <div className="nv-field">
        <label htmlFor="task-form-title">
          Title
          <RequiredMark />
        </label>
        <input
          id="task-form-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          required
        />
      </div>
      <div className="nv-field">
        <label htmlFor="task-form-description">Description</label>
        <textarea
          id="task-form-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>
      <div className="nv-field">
        <label htmlFor="task-form-assignee">Assignee</label>
        <select id="task-form-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          {tenantUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.firstName} {u.lastName}
            </option>
          ))}
        </select>
      </div>
      <div className="nv-field">
        <label htmlFor="task-form-due-date">Due date</label>
        <input id="task-form-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <div className="nv-field flex items-center gap-2">
        <button type="button" className="btn-primary flex-1 text-center" onClick={handleSubmit} disabled={!title.trim()}>
          {task ? 'Save' : 'Add task'}
        </button>
        {task && onCancelEdit && (
          <button type="button" className="icon-btn" onClick={onCancelEdit} aria-label="Cancel edit">
            <XIcon className="h-3.5 w-3.5" />
          </button>
        )}
        {task && onDelete && (
          <button type="button" className="icon-btn danger" onClick={onDelete} aria-label="Delete task">
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
