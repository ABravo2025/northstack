import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('tasks');
  const toast = useToast();

  const handleSubmit = async (payload: TaskFormPayload) => {
    if (!task) return;
    try {
      await api.updateTask(token, task.id, payload);
      toast.success(t('myTasks.toasts.taskUpdated'));
      onClose();
      await onSaved();
    } catch (error) {
      toast.error(t('myTasks.toasts.failedToSaveTask', { message: (error as Error).message }));
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    try {
      await api.deleteTask(token, task.id);
      toast.success(t('myTasks.toasts.taskDeleted'));
      onClose();
      await onSaved();
    } catch (error) {
      toast.error(t('myTasks.toasts.failedToDeleteTask', { message: (error as Error).message }));
    }
  };

  return (
    <Modal open={!!task} title={task?.entitySummary ? `${task.entitySummary}` : t('myTasks.detail.defaultTitle')} onClose={onClose}>
      {task && (
        <div className="flex flex-col gap-4">
          <div className="task-hub-detail-meta">
            <div className="task-hub-detail-row">
              <span className="task-hub-detail-row-label">{t('myTasks.detail.created')}</span>
              <span>{formatHubDate(task.createdAt)}</span>
            </div>
            <div className="task-hub-detail-row">
              <span className="task-hub-detail-row-label">{t('myTasks.detail.due')}</span>
              <span>{task.dueDate ? formatHubDate(task.dueDate) : t('myTasks.common.noDueDate')}</span>
            </div>
            {task.completedAt && (
              <div className="task-hub-detail-row">
                <span className="task-hub-detail-row-label">{t('myTasks.detail.completed')}</span>
                <span>{formatHubDate(task.completedAt)}</span>
              </div>
            )}
            {task.googleMeetUrl && (
              <div className="task-hub-detail-row">
                <span className="task-hub-detail-row-label">{t('myTasks.detail.meet')}</span>
                <a href={task.googleMeetUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-accent underline">
                  <VideoIcon className="h-3.5 w-3.5" />
                  {t('myTasks.actions.joinGoogleMeet')}
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
            submitLabel={t('myTasks.detail.saveChanges')}
            deleteLabel={t('myTasks.detail.deleteTask')}
            onSubmit={handleSubmit}
            onDelete={handleDelete}
          />
        </div>
      )}
    </Modal>
  );
}
