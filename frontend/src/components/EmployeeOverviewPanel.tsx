import { useEffect } from 'react';
import { api } from '../api';
import { useToast } from './ToastProvider';
import Avatar from './Avatar';
import StatusChip from './StatusChip';
import AutoSaveField from './AutoSaveField';
import AutoSaveSelect from './AutoSaveSelect';
import DetailSidebar from './DetailSidebar';
import Field from './Field';
import { XIcon } from './Icons';

interface EmployeeOverviewPanelProps {
  employee: any;
  employees: any[]; // full tenant roster, for the "Reports To" dropdown (excluding self)
  tenantCurrency: string;
  isOwner: boolean;
  token: string;
  tenantUsers: { id: string; firstName: string; lastName: string }[];
  currentUserId: string;
  customFields: any[];
  statuses: any[];
  departments: any[];
  jobTitles: any[];
  timeOffPolicies: any[];
  onClose: () => void;
  onChanged: () => void;
}

function dollarsToCents(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : Math.round(parsed * 100);
}

function centsToDollars(cents: number | null | undefined): string {
  return cents == null ? '' : (cents / 100).toFixed(2);
}

// Unified with the Company/Contact/Opportunity detail pattern (Checkpoint F,
// docs/tareas-desarrollo.md): no tabs, no "Edit employee" button — every field
// is editable in place via AutoSaveField/AutoSaveSelect. Name/business email
// stay editable here (unlike Company/Contact, which have no inline rename at
// all today) — a deliberate exception confirmed with the user rather than a
// silent capability loss.
export default function EmployeeOverviewPanel({
  employee,
  employees,
  tenantCurrency,
  isOwner,
  token,
  tenantUsers,
  currentUserId,
  customFields,
  statuses,
  departments,
  jobTitles,
  timeOffPolicies,
  onClose,
  onChanged,
}: EmployeeOverviewPanelProps) {
  const toast = useToast();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Refreshes the parent list in the background after every save (silent —
  // no loading flash, see EmployeesPage.tsx's refreshEmployeesSilently) so
  // the row/panel shows the new value once the user leaves and comes back —
  // previously only custom fields and Time Off Policy changes did this, so a
  // plain field save (e.g. Personal Email) looked like it hadn't persisted
  // at all (found by the user 2026-07-30).
  const save = async (data: Record<string, unknown>) => {
    const updated = await api.updateEmployee(token, employee.id, data as any);
    onChanged();
    return updated;
  };

  const saveCustomField = async (fieldId: string, value: string) => {
    const existing = employee.customFieldVals?.find((v: any) => v.customFieldDefinitionId === fieldId);
    if (!value.trim() && existing) {
      await api.deleteEmployeeCustomFieldValue(token, employee.id, existing.id);
    } else if (value.trim() && existing) {
      await api.updateEmployeeCustomFieldValue(token, employee.id, existing.id, value.trim());
    } else if (value.trim() && !existing) {
      await api.createEmployeeCustomFieldValue(token, employee.id, { customFieldDefinitionId: fieldId, value: value.trim() });
    }
    onChanged();
  };

  const assignedPolicyIds = new Set((employee.timeOffPolicies || []).map((a: any) => a.timeOffPolicyId));
  const assignedPolicies = timeOffPolicies.filter((p) => assignedPolicyIds.has(p.id));
  const unassignedPolicies = timeOffPolicies.filter((p) => !assignedPolicyIds.has(p.id));

  const handleUnassignPolicy = async (policyId: string) => {
    try {
      await api.unassignTimeOffPolicyFromEmployee(token, employee.id, policyId);
      onChanged();
    } catch (error) {
      toast.error('Failed to unassign policy: ' + (error as Error).message);
    }
  };

  const handleAssignPolicy = async (policyId: string) => {
    if (!policyId) return;
    try {
      await api.assignTimeOffPolicyToEmployee(token, employee.id, policyId);
      onChanged();
    } catch (error) {
      toast.error('Failed to assign policy: ' + (error as Error).message);
    }
  };

  return (
    <div className="detail-modal-overlay" onClick={onClose}>
      <div
        className="overview-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-overview-name"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overview-panel-head">
          <button type="button" className="slideover-close" onClick={onClose} aria-label="Close">
            <XIcon className="h-4 w-4" />
          </button>
          <Avatar firstName={employee.firstName} lastName={employee.lastName} />
          <div className="overview-panel-heading">
            <h3 id="employee-overview-name">
              {employee.firstName} {employee.lastName}
            </h3>
            <p>{employee.email}</p>
            {employee.statusDefn && (
              <StatusChip color={employee.statusDefn.color || '#6b7280'} label={employee.statusDefn.name} />
            )}
          </div>
        </div>

        <div className="overview-panel-main">
        <div className="overview-panel-left">
          <Field label="First Name">
            <AutoSaveField label="First Name" value={employee.firstName} onSave={(v) => save({ firstName: v })} />
          </Field>
          <Field label="Last Name">
            <AutoSaveField label="Last Name" value={employee.lastName} onSave={(v) => save({ lastName: v })} />
          </Field>
          <Field label="Business Email">
            <AutoSaveField label="Business Email" type="email" value={employee.email} onSave={(v) => save({ email: v })} />
          </Field>
          <Field label="Personal Email">
            <AutoSaveField
              label="Personal Email"
              type="email"
              value={employee.personalEmail || ''}
              onSave={(v) => save({ personalEmail: v || null })}
            />
          </Field>
          <Field label="Status">
            <AutoSaveSelect
              label="Status"
              value={employee.statusId}
              onSave={(v) => save({ statusId: v })}
              options={statuses.map((s) => ({ value: s.id, label: s.name }))}
              emptyLabel="-- select --"
            />
          </Field>
          <Field label="Department">
            <AutoSaveSelect
              label="Department"
              value={employee.departmentId || ''}
              onSave={(v) => save({ departmentId: v || null })}
              options={departments.filter((d) => d.isActive).map((d) => ({ value: d.id, label: d.name }))}
            />
          </Field>
          <Field label="Job Title">
            <AutoSaveSelect
              label="Job Title"
              value={employee.jobTitleId || ''}
              onSave={(v) => save({ jobTitleId: v || null })}
              options={jobTitles.filter((j) => j.isActive).map((j) => ({ value: j.id, label: j.name }))}
            />
          </Field>
          <Field label="Reports To">
            <AutoSaveSelect
              label="Reports To"
              value={employee.managerId || ''}
              onSave={(v) => save({ managerId: v || null })}
              emptyLabel="-- no manager --"
              options={employees
                .filter((e) => e.id !== employee.id)
                .map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` }))}
            />
          </Field>
          <Field label="Contract Type">
            <AutoSaveSelect
              label="Contract Type"
              value={employee.contractType || ''}
              onSave={(v) => save({ contractType: v || null })}
              options={[
                { value: 'part_time', label: 'Part Time' },
                { value: 'full_time', label: 'Full Time' },
              ]}
            />
          </Field>
          <Field label="Compensation Type">
            <AutoSaveSelect
              label="Compensation Type"
              value={employee.compensationType || ''}
              onSave={(v) => save({ compensationType: v || null })}
              options={[
                { value: 'hourly', label: 'Hourly' },
                { value: 'monthly', label: 'Monthly' },
              ]}
            />
          </Field>
          {isOwner && (
            <Field label={`Hourly Rate (${tenantCurrency})`}>
              <AutoSaveField
                label="Hourly Rate"
                type="number"
                value={centsToDollars(employee.hourlyRateCents)}
                onSave={(v) => save({ hourlyRateCents: dollarsToCents(v) })}
              />
            </Field>
          )}
          {isOwner && (
            <Field label={`Monthly Rate (${tenantCurrency})`}>
              <AutoSaveField
                label="Monthly Rate"
                type="number"
                value={centsToDollars(employee.monthlyRateCents)}
                onSave={(v) => save({ monthlyRateCents: dollarsToCents(v) })}
              />
            </Field>
          )}
          <Field label="Start Date">
            <AutoSaveField
              label="Start Date"
              type="date"
              value={employee.startDate ? employee.startDate.slice(0, 10) : ''}
              onSave={(v) => save({ startDate: v || null })}
            />
          </Field>
          <Field label="End Date">
            <AutoSaveField
              label="End Date"
              type="date"
              value={employee.endDate ? employee.endDate.slice(0, 10) : ''}
              onSave={(v) => save({ endDate: v || null })}
            />
          </Field>
          <Field label="Contract URL">
            <AutoSaveField
              label="Contract URL"
              type="url"
              value={employee.contractUrl || ''}
              onSave={(v) => save({ contractUrl: v || null })}
            />
          </Field>

          {customFields.map((field) => {
            const existing = employee.customFieldVals?.find((v: any) => v.customFieldDefinitionId === field.id);
            return (
              <Field key={field.id} label={field.name}>
                {field.fieldType === 'select' ? (
                  <AutoSaveSelect
                    label={field.name}
                    value={existing?.value || ''}
                    onSave={(v) => saveCustomField(field.id, v)}
                    options={(JSON.parse(field.options || '[]') as string[]).map((opt) => ({ value: opt, label: opt }))}
                  />
                ) : (
                  <AutoSaveField
                    label={field.name}
                    type={
                      field.fieldType === 'number'
                        ? 'number'
                        : field.fieldType === 'date'
                          ? 'date'
                          : field.fieldType === 'email'
                            ? 'email'
                            : 'text'
                    }
                    value={existing?.value || ''}
                    onSave={(v) => saveCustomField(field.id, v)}
                  />
                )}
              </Field>
            );
          })}

          <div className="overview-field overview-field-full">
            <span className="overview-field-label">Time Off Policies ({assignedPolicies.length})</span>
            {assignedPolicies.length === 0 && <p className="text-xs text-gray-400">No policies assigned.</p>}
            {assignedPolicies.map((policy) => (
              <div key={policy.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                <span>{policy.name}</span>
                <button type="button" className="icon-btn" onClick={() => handleUnassignPolicy(policy.id)}>
                  <span className="tip">Unassign</span>
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {unassignedPolicies.length > 0 && (
              <select value="" onChange={(e) => handleAssignPolicy(e.target.value)} aria-label="Assign a time off policy">
                <option value="">+ Assign a policy…</option>
                {unassignedPolicies.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name}
                  </option>
                ))}
              </select>
            )}
          </div>

        </div>

        <DetailSidebar
          token={token}
          entityType="employee"
          entityId={employee.id}
          tenantUsers={tenantUsers}
          currentUserId={currentUserId}
        />
        </div>
      </div>
    </div>
  );
}
