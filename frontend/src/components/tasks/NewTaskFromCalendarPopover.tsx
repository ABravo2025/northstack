import { useTranslation } from 'react-i18next';
import { api, type TaskEntityType } from '../../api';
import Popover from '../common/Popover';
import SearchableSelect from '../common/SearchableSelect';
import RequiredMark from '../common/RequiredMark';
import TaskForm, { type TaskFormPayload } from './TaskForm';
import { TASK_ENTITY_TYPE_LABELS, useEntityPicker } from '../../hooks/useEntityPicker';
import { useGoogleCalendarConnected } from '../../hooks/useGoogleCalendarConnected';

interface TenantUserLite {
  id: string;
  firstName: string;
  lastName: string;
}

interface NewTaskFromCalendarPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement>;
  token: string;
  tenantUsers: TenantUserLite[];
  defaultAssigneeId: string;
  defaultDueDate: string; // the calendar day that was clicked, YYYY-MM-DD
  onCreated: () => void | Promise<void>;
}

// Calendar day cells have no fixed entity (unlike the detail-panel "Tasks"
// tab, EntityTasksList.tsx) — clicking one to add a task needs to ask which
// entity it's for first (backlog QA, 2026-08-27: "cliente, compañia o
// empleado" — "cliente" maps to Contact here, since the legacy Client model
// is being phased out, see docs/tareas/backlog.md's CRM section).
export default function NewTaskFromCalendarPopover({
  open,
  onClose,
  anchorRef,
  token,
  tenantUsers,
  defaultAssigneeId,
  defaultDueDate,
  onCreated,
}: NewTaskFromCalendarPopoverProps) {
  const { t } = useTranslation('tasks');
  const { entityType, entityId, setEntityId, entityOptions, loadingOptions, setEntityType, reset } = useEntityPicker();
  const googleCalendarConnected = useGoogleCalendarConnected(token);

  const handleSubmit = async (payload: TaskFormPayload) => {
    if (!entityType || !entityId) return;
    await api.createTask(token, { entityType, entityId, ...payload });
    reset();
    onClose();
    await onCreated();
  };

  return (
    <Popover
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      anchorRef={anchorRef}
      width={280}
    >
      <div className="inline-compose-form">
        <div className="nv-field">
          <label htmlFor="new-task-entity-type">
            {t('myTasks.calendarPopover.whoFor')}
            <RequiredMark />
          </label>
          <select
            id="new-task-entity-type"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as TaskEntityType, token)}
          >
            <option value="">{t('myTasks.common.selectPlaceholder')}</option>
            <option value="contact">{TASK_ENTITY_TYPE_LABELS.contact}</option>
            <option value="company">{TASK_ENTITY_TYPE_LABELS.company}</option>
            <option value="employee">{TASK_ENTITY_TYPE_LABELS.employee}</option>
            <option value="opportunity">{TASK_ENTITY_TYPE_LABELS.opportunity}</option>
          </select>
        </div>
        {entityType && (
          <div className="nv-field">
            <label htmlFor="new-task-entity-id">
              {TASK_ENTITY_TYPE_LABELS[entityType]}
              <RequiredMark />
            </label>
            <SearchableSelect
              id="new-task-entity-id"
              value={entityId}
              onChange={setEntityId}
              options={entityOptions}
              placeholder={loadingOptions ? t('myTasks.common.loading') : t('myTasks.calendarPopover.searchPlaceholder', { entity: TASK_ENTITY_TYPE_LABELS[entityType].toLowerCase() })}
            />
          </div>
        )}
      </div>
      {entityType && entityId && (
        <div className="mt-2">
          <TaskForm
            task={null}
            tenantUsers={tenantUsers}
            defaultAssigneeId={defaultAssigneeId}
            defaultDueDate={defaultDueDate}
            googleCalendarConnected={googleCalendarConnected}
            onSubmit={handleSubmit}
          />
        </div>
      )}
    </Popover>
  );
}
