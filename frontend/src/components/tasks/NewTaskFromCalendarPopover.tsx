import { useState } from 'react';
import { api, type TaskEntityType } from '../../api';
import Popover from '../common/Popover';
import SearchableSelect from '../common/SearchableSelect';
import RequiredMark from '../common/RequiredMark';
import { useToast } from '../common/ToastProvider';
import TaskForm, { type TaskFormPayload } from './TaskForm';

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

const ENTITY_TYPE_LABELS: Record<TaskEntityType, string> = {
  contact: 'Contact',
  company: 'Company',
  employee: 'Employee',
  opportunity: 'Opportunity',
};

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
  const toast = useToast();
  const [entityType, setEntityType] = useState<TaskEntityType | ''>('');
  const [entityId, setEntityId] = useState('');
  const [entityOptions, setEntityOptions] = useState<{ value: string; label: string }[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const reset = () => {
    setEntityType('');
    setEntityId('');
    setEntityOptions([]);
  };

  const handleEntityTypeChange = async (value: TaskEntityType) => {
    setEntityType(value);
    setEntityId('');
    setLoadingOptions(true);
    try {
      if (value === 'contact') {
        const contacts = await api.listContacts(token);
        setEntityOptions(contacts.map((c: any) => ({ value: c.id, label: `${c.firstName} ${c.lastName} (${c.email})` })));
      } else if (value === 'company') {
        const companies = await api.listCompanies(token);
        setEntityOptions(companies.map((c: any) => ({ value: c.id, label: c.name })));
      } else if (value === 'employee') {
        const employees = await api.listEmployees(token);
        setEntityOptions(employees.map((e: any) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` })));
      }
    } catch (error) {
      setEntityOptions([]);
      toast.error('Failed to load options: ' + (error as Error).message);
    } finally {
      setLoadingOptions(false);
    }
  };

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
            Who is this for?
            <RequiredMark />
          </label>
          <select
            id="new-task-entity-type"
            value={entityType}
            onChange={(e) => handleEntityTypeChange(e.target.value as TaskEntityType)}
          >
            <option value="">-- select --</option>
            <option value="contact">{ENTITY_TYPE_LABELS.contact}</option>
            <option value="company">{ENTITY_TYPE_LABELS.company}</option>
            <option value="employee">{ENTITY_TYPE_LABELS.employee}</option>
          </select>
        </div>
        {entityType && (
          <div className="nv-field">
            <label htmlFor="new-task-entity-id">
              {ENTITY_TYPE_LABELS[entityType]}
              <RequiredMark />
            </label>
            <SearchableSelect
              id="new-task-entity-id"
              value={entityId}
              onChange={setEntityId}
              options={entityOptions}
              placeholder={loadingOptions ? 'Loading…' : `Search ${ENTITY_TYPE_LABELS[entityType].toLowerCase()}s…`}
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
            onSubmit={handleSubmit}
          />
        </div>
      )}
    </Popover>
  );
}
