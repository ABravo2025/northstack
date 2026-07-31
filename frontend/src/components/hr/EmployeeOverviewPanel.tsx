import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { EmployeeCompensation, PayFrequency } from '../../api';
import { useToast } from '../common/ToastProvider';
import Avatar from '../common/Avatar';
import StatusChip from '../common/StatusChip';
import AutoSaveField from '../common/AutoSaveField';
import AutoSaveSelect from '../common/AutoSaveSelect';
import DetailSidebar from '../layout/DetailSidebar';
import Field from '../common/Field';
import OverviewActionsMenu from '../common/OverviewActionsMenu';
import { XIcon } from '../common/Icons';
import { formatMoney } from '../../lib/currencies';

interface EmployeeOverviewPanelProps {
  employee: any;
  employees: any[]; // full tenant roster, for the "Reports To" dropdown (excluding self)
  tenantCurrency: string;
  isOwner: boolean;
  isOwnerOrAdmin: boolean;
  token: string;
  tenantUsers: { id: string; firstName: string; lastName: string }[];
  currentUserId: string;
  customFields: any[];
  statuses: any[];
  departments: any[];
  jobTitles: any[];
  timeOffPolicies: any[];
  canManageEmployees: boolean;
  onClose: () => void;
  onChanged: () => void;
  onSaved: (updatedEmployee: any) => void;
  onRequestDelete: () => void;
  onInvite: () => void;
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
  isOwnerOrAdmin,
  token,
  tenantUsers,
  currentUserId,
  customFields,
  statuses,
  departments,
  jobTitles,
  timeOffPolicies,
  canManageEmployees,
  onClose,
  onChanged,
  onSaved,
  onRequestDelete,
  onInvite,
}: EmployeeOverviewPanelProps) {
  const toast = useToast();
  const canSeeCompensation = isOwnerOrAdmin || employee.userId === currentUserId;
  const [compensationHistory, setCompensationHistory] = useState<EmployeeCompensation[]>([]);
  const [compensationHistoryOpen, setCompensationHistoryOpen] = useState(false);
  const [payFrequencyOptions, setPayFrequencyOptions] = useState<PayFrequency[]>([]);
  const [addingCompensation, setAddingCompensation] = useState(false);
  const [savingCompensation, setSavingCompensation] = useState(false);
  const [compensationForm, setCompensationForm] = useState({
    compensationType: 'fixed' as 'hourly' | 'fixed',
    rate: '',
    currency: tenantCurrency,
    payFrequencyId: '',
    effectiveFrom: '',
    note: '',
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!canSeeCompensation) return;
    api
      .listEmployeeCompensation(token, employee.id)
      .then(setCompensationHistory)
      .catch((error) => toast.error('Failed to load compensation history: ' + (error as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id, canSeeCompensation]);

  useEffect(() => {
    if (!isOwner) return;
    api
      .listPayFrequencies(token)
      .then((freqs) => setPayFrequencyOptions(freqs.filter((f) => f.isActive)))
      .catch(() => {
        // Non-critical for the rest of the panel — the "+ Add compensation" form just won't have options.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  const currentCompensation = compensationHistory.find((c) => c.effectiveTo === null) || null;
  const pastCompensation = compensationHistory.filter((c) => c.effectiveTo !== null);

  const handleAddCompensation = async (e: React.FormEvent) => {
    e.preventDefault();
    const rateCents = Math.round(Number.parseFloat(compensationForm.rate || '0') * 100);
    setSavingCompensation(true);
    try {
      const created = await api.createEmployeeCompensation(token, employee.id, {
        compensationType: compensationForm.compensationType,
        rateCents,
        currency: compensationForm.currency,
        payFrequencyId: compensationForm.payFrequencyId,
        effectiveFrom: compensationForm.effectiveFrom,
        note: compensationForm.note || undefined,
      });
      setCompensationHistory((prev) => [created, ...prev.map((c) => (c.effectiveTo === null ? { ...c, effectiveTo: created.effectiveFrom } : c))]);
      setAddingCompensation(false);
      setCompensationForm({ compensationType: 'fixed', rate: '', currency: tenantCurrency, payFrequencyId: '', effectiveFrom: '', note: '' });
      toast.success('Compensation added.');
    } catch (error) {
      toast.error('Failed to add compensation: ' + (error as Error).message);
    } finally {
      setSavingCompensation(false);
    }
  };

  // Two-part update: onSaved patches the row instantly with the PATCH
  // response (no round-trip wait — found by the user 2026-07-30, the
  // background-refetch-only fix updated the row eventually but not "on
  // time"), then onChanged still runs a silent background re-fetch behind
  // it — updateEmployee's response doesn't include departmentDefn/
  // jobTitleDefn/statusDefn/manager, so an FK field (e.g. Department) would
  // show the right id but a stale label until that refresh lands.
  const save = async (data: Record<string, unknown>) => {
    const updated = await api.updateEmployee(token, employee.id, data as any);
    onSaved(updated);
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
          <OverviewActionsMenu
            className="overview-actions-trigger"
            items={[
              ...(canManageEmployees && !employee.userId ? [{ label: 'Invite to app', onClick: onInvite }] : []),
              { label: 'Delete', onClick: onRequestDelete, danger: true },
            ]}
          />
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
          <div className="field-group">
            <h4 className="field-group-title">Identity</h4>
            <div className="field-group-body">
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
            </div>
          </div>

          <div className="field-group">
            <h4 className="field-group-title">Role</h4>
            <div className="field-group-body">
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
            </div>
          </div>

          <div className="field-group">
            <h4 className="field-group-title">Contract &amp; compensation</h4>
            <div className="field-group-body">
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

              <div className="overview-field overview-field-full">
                <span className="overview-field-label">Time Off Policies ({assignedPolicies.length})</span>
                <div className="min-w-0 flex-1">
                  {assignedPolicies.length === 0 && <p className="text-xs text-ink-faint">No policies assigned.</p>}
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
            </div>
          </div>

          {canSeeCompensation && (
            <div className="field-group">
              <h4 className="field-group-title">Compensation</h4>
              <div className="field-group-body">
                <div className="overview-field overview-field-full">
                  {currentCompensation ? (
                    <div className="text-sm">
                      <div className="font-semibold text-brand-navy dark:text-gray-100">
                        {formatMoney(currentCompensation.rateCents, currentCompensation.currency)}
                        {currentCompensation.compensationType === 'hourly' ? ' / hour' : ''}
                        {' · '}
                        {currentCompensation.payFrequency.name}
                      </div>
                      <div className="text-xs text-ink-faint">
                        Effective since {currentCompensation.effectiveFrom.slice(0, 10)}
                        {currentCompensation.note ? ` — ${currentCompensation.note}` : ''}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-ink-faint">No compensation on file yet.</p>
                  )}

                  {pastCompensation.length > 0 && (
                    <button
                      type="button"
                      className="status-manage-link mt-1.5"
                      onClick={() => setCompensationHistoryOpen((v) => !v)}
                    >
                      {compensationHistoryOpen ? 'Hide' : 'Show'} history ({pastCompensation.length})
                    </button>
                  )}
                  {compensationHistoryOpen && (
                    <div className="mt-1.5 space-y-1.5">
                      {pastCompensation.map((c) => (
                        <div key={c.id} className="text-xs text-ink-faint">
                          {formatMoney(c.rateCents, c.currency)}
                          {c.compensationType === 'hourly' ? '/hr' : ''} · {c.payFrequency.name} ·{' '}
                          {c.effectiveFrom.slice(0, 10)} → {c.effectiveTo?.slice(0, 10)}
                          {c.note ? ` — ${c.note}` : ''}
                        </div>
                      ))}
                    </div>
                  )}

                  {isOwner && !addingCompensation && (
                    <button type="button" className="status-manage-link mt-1.5" onClick={() => setAddingCompensation(true)}>
                      + Add compensation
                    </button>
                  )}
                  {isOwner && addingCompensation && (
                    <form className="inline-compose-form mt-2" onSubmit={handleAddCompensation}>
                      <div className="form-group">
                        <label htmlFor="comp-type">Type</label>
                        <select
                          id="comp-type"
                          value={compensationForm.compensationType}
                          onChange={(e) =>
                            setCompensationForm({ ...compensationForm, compensationType: e.target.value as 'hourly' | 'fixed' })
                          }
                        >
                          <option value="fixed">Fixed</option>
                          <option value="hourly">Hourly</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="comp-rate">Rate ({compensationForm.currency})</label>
                        <input
                          id="comp-rate"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={compensationForm.rate}
                          onChange={(e) => setCompensationForm({ ...compensationForm, rate: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="comp-frequency">Pay Frequency</label>
                        <select
                          id="comp-frequency"
                          value={compensationForm.payFrequencyId}
                          onChange={(e) => setCompensationForm({ ...compensationForm, payFrequencyId: e.target.value })}
                          required
                        >
                          <option value="">-- select --</option>
                          {payFrequencyOptions.map((freq) => (
                            <option key={freq.id} value={freq.id}>
                              {freq.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="comp-effective">Effective from</label>
                        <input
                          id="comp-effective"
                          type="date"
                          value={compensationForm.effectiveFrom}
                          onChange={(e) => setCompensationForm({ ...compensationForm, effectiveFrom: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="comp-note">Note (optional)</label>
                        <input
                          id="comp-note"
                          type="text"
                          value={compensationForm.note}
                          onChange={(e) => setCompensationForm({ ...compensationForm, note: e.target.value })}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button type="button" className="btn-secondary" onClick={() => setAddingCompensation(false)}>
                          Cancel
                        </button>
                        <button type="submit" className="btn-primary" disabled={savingCompensation}>
                          {savingCompensation ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          )}

          {customFields.length > 0 && (
            <div className="field-group">
              <h4 className="field-group-title">Custom fields</h4>
              <div className="field-group-body">
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
              </div>
            </div>
          )}
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
