import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { EmployeeCompensationSummary, EmployeePaymentHistoryEntry } from '../../api';
import { useToast } from '../common/ToastProvider';
import Avatar from '../common/Avatar';
import StatusChip from '../common/StatusChip';
import AutoSaveField from '../common/AutoSaveField';
import AutoSaveSelect from '../common/AutoSaveSelect';
import DetailSidebar from '../layout/DetailSidebar';
import Field from '../common/Field';
import OverviewActionsMenu from '../common/OverviewActionsMenu';
import PayslipPreviewModal from '../payroll/PayslipPreviewModal';
import TerminateEmployeeModal from './TerminateEmployeeModal';
import { formatMoney } from '../../lib/currencies';
import { EyeIcon, XIcon } from '../common/Icons';
import TagInput from '../common/TagInput';
import type { TagAssignmentLite, EmployeeTerminationOptions } from '../../api';

interface EmployeeOverviewPanelProps {
  employee: any;
  employees: any[]; // full tenant roster, for the "Reports To" dropdown (excluding self)
  token: string;
  tenantUsers: { id: string; firstName: string; lastName: string }[];
  currentUserId: string;
  customFields: any[];
  statuses: any[];
  departments: any[];
  jobTitles: any[];
  timeOffPolicies: any[];
  canManageEmployees: boolean;
  // Owner-only, same gate as the rest of Payroll (canManagePayroll) — this
  // person's contract PDF and its resend action are compensation data, not
  // general HR data, so an admin who can otherwise manage employees still
  // shouldn't see these (the backend enforces the same boundary).
  canManagePayroll: boolean;
  onClose: () => void;
  onChanged: () => void;
  onSaved: (updatedEmployee: any) => void;
  onRequestDelete: () => void;
  onInvite: () => void;
}

const HAS_CONTRACT_STATUSES = new Set(['confirmado', 'pendiente', 'vencido']);

// Same 3-state chip config as EmployeesPage.tsx's list column — surfaced
// here too so the contract status is visible from the profile itself, not
// only the table (backlog QA, 2026-08-27).
const CONTRACT_STATUS_CHIPS = {
  confirmado: { color: '#059669', label: 'Contract confirmed' },
  pendiente: { color: '#9ca3af', label: 'Contract pending' },
  vencido: { color: '#dc2626', label: 'Contract expired' },
};

// Same labels as PayrollPage.tsx's timeline ("Reason" column here) — kept in sync manually,
// same as ADJUSTMENT_TYPE_LABELS there (no shared constants file for payroll UI yet).
const PAYMENT_TYPE_LABELS: Record<string, string> = {
  base: 'Payment',
  bonus: 'Bonus',
  commission: 'Commission',
  reimbursement: 'Reimbursement',
  deduction: 'Deduction',
};

// Unified with the Company/Contact/Opportunity detail pattern (Checkpoint F,
// docs/tareas-desarrollo.md): no tabs, no "Edit employee" button — every field
// is editable in place via AutoSaveField/AutoSaveSelect. Name/business email
// stay editable here (unlike Company/Contact, which have no inline rename at
// all today) — a deliberate exception confirmed with the user rather than a
// silent capability loss.
export default function EmployeeOverviewPanel({
  employee,
  employees,
  token,
  tenantUsers,
  currentUserId,
  customFields,
  statuses,
  departments,
  jobTitles,
  timeOffPolicies,
  canManageEmployees,
  canManagePayroll,
  onClose,
  onChanged,
  onSaved,
  onRequestDelete,
  onInvite,
}: EmployeeOverviewPanelProps) {
  const toast = useToast();
  const [contractPreviewOpen, setContractPreviewOpen] = useState(false);
  const [paymentPayslipEntryId, setPaymentPayslipEntryId] = useState<string | null>(null);
  const [resendingContract, setResendingContract] = useState(false);
  const [compensation, setCompensation] = useState<EmployeeCompensationSummary | null>(null);
  const [loadingCompensation, setLoadingCompensation] = useState(false);
  const [tags, setTags] = useState<TagAssignmentLite[]>([]);
  const [terminationOptions, setTerminationOptions] = useState<EmployeeTerminationOptions | null>(null);
  const [terminateModalOpen, setTerminateModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'payments'>('overview');
  const [paymentHistory, setPaymentHistory] = useState<EmployeePaymentHistoryEntry[]>([]);
  const [loadingPaymentHistory, setLoadingPaymentHistory] = useState(false);
  const hasContract = canManagePayroll && HAS_CONTRACT_STATUSES.has(employee.contractStatus);

  const loadTags = () => {
    api.listTagsForEntity(token, 'employee', employee.id).then(setTags).catch(() => {});
  };

  const loadTerminationOptions = () => {
    if (!canManageEmployees) return;
    api.getTerminationOptions(token, employee.id).then(setTerminationOptions).catch(() => {});
  };

  useEffect(() => {
    loadTags();
    loadTerminationOptions();
    setActiveTab('overview');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  useEffect(() => {
    if (!canManagePayroll) return;
    setLoadingPaymentHistory(true);
    api
      .getEmployeePaymentHistory(token, employee.id)
      .then(setPaymentHistory)
      .catch(() => setPaymentHistory([]))
      .finally(() => setLoadingPaymentHistory(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id, canManagePayroll]);

  const handleCancelTermination = async () => {
    if (!terminationOptions?.pendingTermination) return;
    try {
      await api.cancelTermination(token, terminationOptions.pendingTermination.id);
      toast.success('Scheduled termination cancelled.');
      loadTerminationOptions();
    } catch (error) {
      toast.error('Failed to cancel termination: ' + (error as Error).message);
    }
  };

  useEffect(() => {
    if (!hasContract) {
      setCompensation(null);
      return;
    }
    setLoadingCompensation(true);
    api
      .getEmployeeCompensation(token, employee.id)
      .then(setCompensation)
      .catch(() => setCompensation(null))
      .finally(() => setLoadingCompensation(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id, hasContract]);

  const handleResendContract = async () => {
    setResendingContract(true);
    try {
      await api.resendContract(token, employee.id);
      toast.success('Contract resent.');
    } catch (error) {
      toast.error('Failed to resend contract: ' + (error as Error).message);
    } finally {
      setResendingContract(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
              ...(canManageEmployees &&
              !employee.statusDefn?.isTerminatedStatus &&
              !terminationOptions?.pendingTermination
                ? [{ label: 'Terminate', onClick: () => setTerminateModalOpen(true), danger: true }]
                : []),
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
            <div className="flex items-center gap-1.5">
              {employee.statusDefn && (
                <StatusChip color={employee.statusDefn.color || '#6b7280'} label={employee.statusDefn.name} />
              )}
              {employee.contractStatus && CONTRACT_STATUS_CHIPS[employee.contractStatus as keyof typeof CONTRACT_STATUS_CHIPS] && (
                <StatusChip {...CONTRACT_STATUS_CHIPS[employee.contractStatus as keyof typeof CONTRACT_STATUS_CHIPS]} />
              )}
            </div>
            {terminationOptions?.pendingTermination && (
              <div className="flex items-center gap-2">
                <p className="text-xs text-ink-faint">
                  Scheduled termination: {terminationOptions.pendingTermination.terminationDate.slice(0, 10)}
                </p>
                <button type="button" className="btn-secondary btn-sm" onClick={handleCancelTermination}>
                  Cancel
                </button>
              </div>
            )}
            <TagInput token={token} entityType="employee" entityId={employee.id} tags={tags} onChanged={loadTags} />
          </div>
        </div>

        {canManagePayroll && (
          <div className="mini-toggle-row mx-4 mt-3">
            <button
              type="button"
              className={`mini-toggle-opt ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              className={`mini-toggle-opt ${activeTab === 'payments' ? 'active' : ''}`}
              onClick={() => setActiveTab('payments')}
            >
              Payment History
            </button>
          </div>
        )}

        <div className="overview-panel-main">
        {activeTab === 'payments' ? (
          <div className="overview-panel-left">
            <div className="field-group">
              <h4 className="field-group-title">Payment History</h4>
              <div className="field-group-body">
                {loadingPaymentHistory ? (
                  <>
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="skeleton-row" style={{ height: 28, animationDelay: `${i * 0.08}s` }}>
                        <span className="skeleton-bar" style={{ width: 80, marginRight: 16 }} />
                        <span className="skeleton-bar" style={{ width: 130 }} />
                      </div>
                    ))}
                  </>
                ) : paymentHistory.length === 0 ? (
                  <p className="text-sm text-ink-faint">No payments recorded yet.</p>
                ) : (
                  <div className="overview-field overview-field-full">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Reason</th>
                          <th>Description</th>
                          <th>Amount</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentHistory.map((entry) => (
                          <tr key={entry.id}>
                            <td>{entry.paymentDate.slice(0, 10)}</td>
                            <td>{PAYMENT_TYPE_LABELS[entry.type] || entry.type}</td>
                            <td>{entry.label || (entry.periodLabel ? `Payroll: ${entry.periodLabel}` : '—')}</td>
                            <td>{formatMoney(entry.amountCents, entry.currency)}</td>
                            <td>
                              <button
                                type="button"
                                className="icon-btn"
                                onClick={() => setPaymentPayslipEntryId(entry.id)}
                                aria-label="Payslip preview"
                              >
                                <span className="tip">Payslip preview</span>
                                <EyeIcon className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
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
                {employee.statusDefn?.isTerminatedStatus ? (
                  <StatusChip color={employee.statusDefn.color || '#6b7280'} label={employee.statusDefn.name} />
                ) : (
                  <AutoSaveSelect
                    label="Status"
                    value={employee.statusId}
                    onSave={(v) => save({ statusId: v })}
                    options={statuses.map((s) => ({ value: s.id, label: s.name }))}
                    emptyLabel="-- select --"
                  />
                )}
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
            <h4 className="field-group-title">Contract</h4>
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

          {hasContract && (
            <div className="field-group">
              <h4 className="field-group-title">Compensation</h4>
              <div className="field-group-body">
                {loadingCompensation ? (
                  <>
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="skeleton-row" style={{ height: 28, animationDelay: `${i * 0.08}s` }}>
                        <span className="skeleton-bar" style={{ width: 80, marginRight: 16 }} />
                        <span className="skeleton-bar" style={{ width: 130 }} />
                      </div>
                    ))}
                  </>
                ) : !compensation ? (
                  <p className="text-sm text-ink-faint">No active compensation.</p>
                ) : (
                  <>
                    <div className="overview-field">
                      <span className="overview-field-label">Type</span>
                      <span className="overview-field-value">
                        {compensation.compensationType === 'hourly' ? 'Hourly' : 'Fixed'}
                      </span>
                    </div>
                    <div className="overview-field">
                      <span className="overview-field-label">Rate</span>
                      <span className="overview-field-value">{formatMoney(compensation.rateCents, compensation.currency)}</span>
                    </div>
                    <div className="overview-field">
                      <span className="overview-field-label">Pay Frequency</span>
                      <span className="overview-field-value">{compensation.payFrequencyName}</span>
                    </div>
                    <div className="overview-field">
                      <span className="overview-field-label">Effective From</span>
                      <span className="overview-field-value">{compensation.effectiveFrom.slice(0, 10)}</span>
                    </div>
                    <div className="overview-field">
                      <span className="overview-field-label">Job Title</span>
                      <span className="overview-field-value">{compensation.jobTitle}</span>
                    </div>
                    <div className="overview-field overview-field-full">
                      <span className="overview-field-label">Role Description</span>
                      <span className="overview-field-value">{compensation.description}</span>
                    </div>
                    {compensation.note && (
                      <div className="overview-field overview-field-full">
                        <span className="overview-field-label">Note</span>
                        <span className="overview-field-value">{compensation.note}</span>
                      </div>
                    )}
                    <div className="overview-field">
                      <span className="overview-field-label">Contract Status</span>
                      <span className="overview-field-value">
                        {compensation.confirmedAt
                          ? `Confirmed on ${compensation.confirmedAt.slice(0, 10)}`
                          : 'Pending signature'}
                      </span>
                    </div>
                    <div className="overview-field overview-field-full">
                      <span className="overview-field-label"></span>
                      <div className="flex gap-2">
                        <button type="button" className="btn-secondary btn-sm" onClick={() => setContractPreviewOpen(true)}>
                          View contract
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={handleResendContract}
                          disabled={resendingContract}
                        >
                          {resendingContract ? 'Resending…' : 'Resend contract'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
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
        )}

        <DetailSidebar
          token={token}
          entityType="employee"
          entityId={employee.id}
          tenantUsers={tenantUsers}
          currentUserId={currentUserId}
        />
        </div>
      </div>
      {contractPreviewOpen && (
        <PayslipPreviewModal
          open={contractPreviewOpen}
          onClose={() => setContractPreviewOpen(false)}
          fetchPdf={() => api.getEmployeeContractPdf(token, employee.id)}
          title="Contract"
          downloadFilename="contract.pdf"
          helperText="This is the exact document generated for this contract."
        />
      )}
      {paymentPayslipEntryId && (
        <PayslipPreviewModal
          open={paymentPayslipEntryId !== null}
          onClose={() => setPaymentPayslipEntryId(null)}
          fetchPdf={() => api.getEntryPayslip(token, paymentPayslipEntryId)}
        />
      )}
      {terminateModalOpen && (
        <TerminateEmployeeModal
          open={terminateModalOpen}
          onClose={() => setTerminateModalOpen(false)}
          token={token}
          employee={employee}
          employees={employees}
          canIncludeFinalPayment={canManagePayroll}
          defaultCurrency={compensation?.currency}
          onTerminated={() => {
            loadTerminationOptions();
            onChanged();
          }}
        />
      )}
    </div>
  );
}
