import { useState } from 'react';
import { api, type TaskEntityType } from '../api';
import { useToast } from '../components/common/ToastProvider';

export const TASK_ENTITY_TYPE_LABELS: Record<TaskEntityType, string> = {
  contact: 'Contact',
  company: 'Company',
  employee: 'Employee',
  opportunity: 'Opportunity',
};

interface EntityOption {
  value: string;
  label: string;
}

// Shared "which record is this Task about" picker — entity type, then a SearchableSelect of that
// type's records — used anywhere a Task is created outside an entity's own detail page (no fixed
// entityType/entityId already in context). Extracted from NewTaskFromCalendarPopover.tsx so the My
// Tasks hub's "Add task" flow doesn't reimplement the same type->options loading logic.
export function useEntityPicker() {
  const toast = useToast();
  const [entityType, setEntityTypeState] = useState<TaskEntityType | ''>('');
  const [entityId, setEntityId] = useState('');
  const [entityOptions, setEntityOptions] = useState<EntityOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const reset = () => {
    setEntityTypeState('');
    setEntityId('');
    setEntityOptions([]);
  };

  const setEntityType = async (value: TaskEntityType, token: string) => {
    setEntityTypeState(value);
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
        // Custom Roles Fase E — the unscoped directory, not the scoped listEmployees: this picker
        // is "which coworker is this Task about," not an HR view.
        const employees = await api.listEmployeeDirectory(token);
        setEntityOptions(employees.map((e: any) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` })));
      } else if (value === 'opportunity') {
        const opportunities = await api.listOpportunities(token);
        setEntityOptions(opportunities.map((o: any) => ({ value: o.id, label: o.name })));
      }
    } catch (error) {
      setEntityOptions([]);
      toast.error('Failed to load options: ' + (error as Error).message);
    } finally {
      setLoadingOptions(false);
    }
  };

  return { entityType, entityId, setEntityId, entityOptions, loadingOptions, setEntityType, reset };
}
