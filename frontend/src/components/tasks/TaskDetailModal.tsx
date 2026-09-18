import { api, type Task, type TaskFolder } from '../../api';
import Modal from '../common/Modal';
import { useToast } from '../common/ToastProvider';
import { VideoIcon } from '../common/Icons';
import TaskForm, { type TaskFormPayload } from './TaskForm';
import { formatHubDate } from '../../lib/taskHubDates';

interface TenantUserLite {
  id: string;
  firstName: string;
  lastName: string;
}

interface TaskDetailModalProps {
  task: Task | null; // null = closed
  onClose: () => void;
  token: string;
  tenantUsers: TenantUserLite[];
  currentUserId: string;
  folders: TaskFolder[];
  googleCalendarConnected: boolean;
  onSaved: () => void | Promise<void>;
}

// Clicking a task in the My Tasks hub (List row or Board card) opens this — a read-only
// Created/Due/Completed strip (none of those are hand-edited; Completed is a byproduct of the
// checkbox, not a field) above the same TaskForm every other Task surface edits with.
export default function TaskDetailModal({
  task,
  onClose,
  token,
  tenantUsers,
  currentUserId,
  folders,
  googleCalendarConnected,
  onSaved,
}: TaskDetailModalProps) {
  const toast = useToast();

  const handleSubmit = async (payload: TaskFormPayload) => {
    if (!task) return;
    try {
      await api.updateTask(token, task.id, payload);
      toast.success('Task updated.');
      onClose();
      await onSaved();
    } catch (error) {
      toast.error('Failed to save task: ' + (error as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    try {
      await api.deleteTask(token, task.id);
      toast.success('Task deleted.');
      onClose();
      await onSaved();
    } catch (error) {
      toast.error('Failed to delete task: ' + (error as Error).message);
    }
  };

  return (
    <Modal open={!!task} title={task?.entitySummary ? `${task.entitySummary}` : 'Task'} onClose={onClose}>
      {task && (
        <div className="flex flex-col gap-4">
          <div className="task-hub-detail-meta">
            <div className="task-hub-detail-row">
              <span className="task-hub-detail-row-label">Created</span>
              <span>{formatHubDate(task.createdAt)}</span>
            </div>
            <div className="task-hub-detail-row">
              <span className="task-hub-detail-row-label">Due</span>
              <span>{task.dueDate ? formatHubDate(task.dueDate) : 'No due date'}</span>
            </div>
            {task.completedAt && (
              <div className="task-hub-detail-row">
                <span className="task-hub-detail-row-label">Completed</span>
                <span>{formatHubDate(task.completedAt)}</span>
              </div>
            )}
            {task.googleMeetUrl && (
              <div className="task-hub-detail-row">
                <span className="task-hub-detail-row-label">Meet</span>
                <a href={task.googleMeetUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-accent underline">
                  <VideoIcon className="h-3.5 w-3.5" />
                  Join Google Meet
                </a>
              </div>
            )}
          </div>

          <TaskForm
            task={task}
            tenantUsers={tenantUsers}
            defaultAssigneeId={currentUserId}
            folders={folders}
            googleCalendarConnected={googleCalendarConnected}
            submitLabel="Save changes"
            deleteLabel="Delete task"
            onSubmit={handleSubmit}
            onDelete={handleDelete}
          />
        </div>
      )}
    </Modal>
  );
}
