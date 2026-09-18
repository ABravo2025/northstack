import { api, type TaskEntityType, type TaskFolder } from '../../api';
import Modal from '../common/Modal';
import SearchableSelect from '../common/SearchableSelect';
import RequiredMark from '../common/RequiredMark';
import { useToast } from '../common/ToastProvider';
import TaskForm, { type TaskFormPayload } from './TaskForm';
import { TASK_ENTITY_TYPE_LABELS, useEntityPicker } from '../../hooks/useEntityPicker';

interface TenantUserLite {
  id: string;
  firstName: string;
  lastName: string;
}

interface NewTaskModalProps {
  open: boolean;
  onClose: () => void;
  token: string;
  tenantUsers: TenantUserLite[];
  currentUserId: string;
  folders: TaskFolder[];
  defaultFolderId?: string | null;
  googleCalendarConnected: boolean;
  onCreated: () => void | Promise<void>;
}

// The My Tasks hub's "Add task" — the one place in the app that creates a Task with no entity
// already in context (unlike EntityTasksList, opened from inside a Company/Contact/Employee/
// Opportunity's own detail page), so it needs the entity-type-then-record picker up front, same
// pattern as NewTaskFromCalendarPopover.tsx (shared via useEntityPicker).
export default function NewTaskModal({
  open,
  onClose,
  token,
  tenantUsers,
  currentUserId,
  folders,
  defaultFolderId,
  googleCalendarConnected,
  onCreated,
}: NewTaskModalProps) {
  const toast = useToast();
  const { entityType, entityId, setEntityId, entityOptions, loadingOptions, setEntityType, reset } = useEntityPicker();

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (payload: TaskFormPayload) => {
    if (!entityType || !entityId) return;
    try {
      await api.createTask(token, { entityType, entityId, ...payload });
      toast.success('Task created.');
      reset();
      onClose();
      await onCreated();
    } catch (error) {
      toast.error('Failed to create task: ' + (error as Error).message);
    }
  };

  return (
    <Modal open={open} title="New task" onClose={handleClose}>
      <div className="nv-field">
        <label htmlFor="new-task-modal-entity-type">
          Related to
          <RequiredMark />
        </label>
        <select
          id="new-task-modal-entity-type"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value as TaskEntityType, token)}
        >
          <option value="">-- select --</option>
          <option value="company">{TASK_ENTITY_TYPE_LABELS.company}</option>
          <option value="contact">{TASK_ENTITY_TYPE_LABELS.contact}</option>
          <option value="employee">{TASK_ENTITY_TYPE_LABELS.employee}</option>
          <option value="opportunity">{TASK_ENTITY_TYPE_LABELS.opportunity}</option>
        </select>
      </div>
      {entityType && (
        <div className="nv-field">
          <label htmlFor="new-task-modal-entity-id">
            {TASK_ENTITY_TYPE_LABELS[entityType]}
            <RequiredMark />
          </label>
          <SearchableSelect
            id="new-task-modal-entity-id"
            value={entityId}
            onChange={setEntityId}
            options={entityOptions}
            placeholder={loadingOptions ? 'Loading…' : `Search ${TASK_ENTITY_TYPE_LABELS[entityType].toLowerCase()}s…`}
          />
        </div>
      )}
      {entityType && entityId && (
        <TaskForm
          task={null}
          tenantUsers={tenantUsers}
          defaultAssigneeId={currentUserId}
          folders={folders}
          defaultFolderId={defaultFolderId}
          googleCalendarConnected={googleCalendarConnected}
          onSubmit={handleSubmit}
        />
      )}
    </Modal>
  );
}
