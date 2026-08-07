import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import type { CompensationStatusEntry, PayrollEntryType, RunDetail } from '../api';
import { useToast } from '../components/common/ToastProvider';
import Modal from '../components/common/Modal';
import TableSkeleton from '../components/common/TableSkeleton';
import StatusChip from '../components/common/StatusChip';
import { formatMoney } from '../lib/currencies';
import { ChevronDownIcon, ChevronLeftIcon, PlusIcon, TrashIcon } from '../components/common/Icons';

interface PayrollRunDetailPageProps {
  token: string;
}

const ADJUSTMENT_TYPE_LABELS: Record<string, string> = {
  bonus: 'Bonus',
  commission: 'Commission',
  reimbursement: 'Reimbursement',
  deduction: 'Deduction',
};

export default function PayrollRunDetailPage({ token }: PayrollRunDetailPageProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const { runId } = useParams<{ runId: string }>();
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const [adjustmentForm, setAdjustmentForm] = useState({ type: 'bonus' as PayrollEntryType, amount: '', label: '' });
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [hoursDrafts, setHoursDrafts] = useState<Record<string, string>>({});

  const [addPersonModalOpen, setAddPersonModalOpen] = useState(false);
  const [addPersonCandidates, setAddPersonCandidates] = useState<CompensationStatusEntry[]>([]);
  const [addingEmployeeId, setAddingEmployeeId] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const load = async () => {
    if (!runId) return;
    setLoading(true);
    try {
      const data = await api.getPayrollRunDetail(token, runId);
      setDetail(data);
      const drafts: Record<string, string> = {};
      for (const row of data.employeeRows) {
        const base = row.entries.find((e) => e.type === 'base');
        drafts[row.employeeId] = base?.hoursQty != null ? String(base.hoursQty) : '';
      }
      setHoursDrafts(drafts);
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmRun = async () => {
    if (!runId) return;
    setConfirming(true);
    try {
      await api.confirmPayrollRun(token, runId);
      toast.success('Run confirmed.');
      load();
    } catch (error) {
      toast.error('Failed to confirm run: ' + (error as Error).message);
    } finally {
      setConfirming(false);
    }
  };

  const handleSaveHours = async (employeeId: string) => {
    if (!runId || !detail) return;
    const row = detail.employeeRows.find((r) => r.employeeId === employeeId);
    const baseEntry = row?.entries.find((e) => e.type === 'base');
    const hoursValue = Number.parseFloat(hoursDrafts[employeeId] || '');
    if (!baseEntry || Number.isNaN(hoursValue)) return;
    try {
      await api.updatePayrollEntryHours(token, baseEntry.id, hoursValue);
      load();
    } catch (error) {
      toast.error('Failed to update hours: ' + (error as Error).message);
    }
  };

  const toggleExpanded = (employeeId: string) => {
    setExpandedEmployeeId((prev) => (prev === employeeId ? null : employeeId));
    setAdjustmentForm({ type: 'bonus', amount: '', label: '' });
  };

  const handleAddAdjustment = async (e: React.FormEvent, employeeId: string, currency: string) => {
    e.preventDefault();
    if (!runId || !adjustmentForm.amount.trim()) return;
    setSavingAdjustment(true);
    try {
      const signedAmount =
        adjustmentForm.type === 'deduction'
          ? -Math.abs(Math.round(Number.parseFloat(adjustmentForm.amount) * 100))
          : Math.round(Number.parseFloat(adjustmentForm.amount) * 100);
      await api.createPayrollAdjustment(token, {
        runId,
        employeeId,
        type: adjustmentForm.type,
        amountCents: signedAmount,
        currency,
        label: adjustmentForm.label || undefined,
        paymentDate: new Date().toISOString().slice(0, 10),
      });
      setAdjustmentForm({ type: 'bonus', amount: '', label: '' });
      toast.success('Adjustment added.');
      load();
    } catch (error) {
      toast.error('Failed to add adjustment: ' + (error as Error).message);
    } finally {
      setSavingAdjustment(false);
    }
  };

  const handleDeleteAdjustment = async (entryId: string) => {
    try {
      await api.deletePayrollEntry(token, entryId);
      toast.success('Adjustment removed.');
      load();
    } catch (error) {
      toast.error('Failed to remove adjustment: ' + (error as Error).message);
    }
  };

  const openAddPersonModal = async () => {
    try {
      const status = await api.getCompensationStatus(token);
      const includedIds = new Set(detail?.employeeRows.map((r) => r.employeeId));
      setAddPersonCandidates(status.filter((entry) => !includedIds.has(entry.employeeId)));
      setAddPersonModalOpen(true);
    } catch (error) {
      toast.error('Failed to load people: ' + (error as Error).message);
    }
  };

  const handleAddPerson = async (employeeId: string) => {
    if (!runId) return;
    setAddingEmployeeId(employeeId);
    try {
      await api.addEmployeeToPayrollRun(token, runId, employeeId);
      toast.success('Person added to this run.');
      setAddPersonModalOpen(false);
      load();
    } catch (error) {
      toast.error('Failed to add person: ' + (error as Error).message);
    } finally {
      setAddingEmployeeId(null);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <TableSkeleton rows={6} columns={6} />
      </div>
    );
  }

  if (loadError || !detail) {
    return (
      <div className="container">
        <div className="alert alert-error">{loadError || 'Run not found'}</div>
      </div>
    );
  }

  const isDraft = detail.run.status === 'draft';

  return (
    <div className="container">
      <div className="page-toolbar">
        <div className="flex items-center gap-2">
          <button type="button" className="icon-btn" onClick={() => navigate('/hr/payroll')} aria-label="Back to Payroll">
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <h2 className="page-title">{detail.run.periodLabel}</h2>
          <StatusChip color={isDraft ? '#9ca3af' : '#059669'} label={isDraft ? 'Draft' : 'Confirmed'} />
        </div>
        {isDraft && (
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary gap-1.5" onClick={openAddPersonModal}>
              <PlusIcon className="h-3.5 w-3.5" />
              Add person to this run
            </button>
            <span title={detail.hasUnloadedHours ? 'Load hours for every hourly person before confirming' : undefined}>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmRun}
                disabled={confirming || detail.hasUnloadedHours}
              >
                {confirming ? 'Confirming…' : 'Confirm Run'}
              </button>
            </span>
          </div>
        )}
      </div>

      <p className="text-sm text-ink-muted mb-3">Pay frequency: {detail.run.payFrequency?.name || '—'}</p>

      {detail.excludedCount > 0 && (
        <div className="alert alert-error mb-3">
          {detail.excludedCount} {detail.excludedCount === 1 ? 'person' : 'people'} excluded — contract not confirmed yet.
        </div>
      )}

      {detail.employeeRows.length === 0 ? (
        <p className="text-sm text-ink-muted">No one is in this run yet.</p>
      ) : (
        <div className="full-table-wrap">
          <table className="table full-table">
            <thead>
              <tr>
                <th style={{ width: 16 }}></th>
                <th>Name</th>
                <th>Type</th>
                <th>Base</th>
                <th>Adjustments</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {detail.employeeRows.map((row) => {
                const baseEntry = row.entries.find((e) => e.type === 'base');
                const adjustments = row.entries.filter((e) => e.type !== 'base');
                const isExpanded = expandedEmployeeId === row.employeeId;
                return (
                  <>
                    <tr key={row.employeeId} className={row.isInactive ? 'table-row-inactive' : ''}>
                      <td>
                        <span
                          className="color-dot inline-block"
                          style={{ background: row.isInactive ? '#dc2626' : '#059669' }}
                        />
                      </td>
                      <td>
                        {row.employeeFirstName} {row.employeeLastName}
                      </td>
                      <td>
                        <span className="category-chip">{row.compensationType === 'hourly' ? 'Hourly' : 'Fixed'}</span>
                      </td>
                      <td>
                        {row.compensationType === 'fixed' ? (
                          formatMoney(row.baseAmountCents, row.currency)
                        ) : isDraft ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.25"
                              min="0"
                              style={{ width: 80 }}
                              value={hoursDrafts[row.employeeId] ?? ''}
                              onChange={(e) => setHoursDrafts({ ...hoursDrafts, [row.employeeId]: e.target.value })}
                              onBlur={() => handleSaveHours(row.employeeId)}
                            />
                            <span className="text-xs text-ink-muted">
                              hs × {formatMoney(row.rateCents, row.currency)} = {formatMoney(row.baseAmountCents, row.currency)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-ink-muted">
                            {baseEntry?.hoursQty ?? 0} hs × {formatMoney(row.rateCents, row.currency)} ={' '}
                            {formatMoney(row.baseAmountCents, row.currency)}
                          </span>
                        )}
                      </td>
                      <td>
                        <button type="button" className="btn-secondary btn-sm" onClick={() => toggleExpanded(row.employeeId)}>
                          {row.adjustmentsTotalCents === 0
                            ? '+ Adjustments'
                            : `${row.adjustmentsTotalCents > 0 ? '+' : ''}${formatMoney(row.adjustmentsTotalCents, row.currency)}`}
                          <ChevronDownIcon className={`h-3 w-3 ml-1 inline-block transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </td>
                      <td>
                        <strong>{formatMoney(row.totalCents, row.currency)}</strong>
                      </td>
                      <td></td>
                    </tr>
                    {row.isInactive && (
                      <tr key={`${row.employeeId}-inactive-banner`}>
                        <td colSpan={7} style={{ padding: 0 }}>
                          <div className="alert alert-error" style={{ margin: '0 0 0.5rem 0' }}>
                            {row.employeeFirstName} {row.employeeLastName} is not active ({row.statusName}).
                          </div>
                        </td>
                      </tr>
                    )}
                    {isExpanded && (
                      <tr key={`${row.employeeId}-adjustments`}>
                        <td colSpan={7}>
                          <div className="card" style={{ padding: '0.75rem 1rem' }}>
                            {adjustments.length > 0 && (
                              <table className="table" style={{ marginBottom: '0.75rem' }}>
                                <thead>
                                  <tr>
                                    <th>Type</th>
                                    <th>Amount</th>
                                    <th>Note</th>
                                    {isDraft && <th></th>}
                                  </tr>
                                </thead>
                                <tbody>
                                  {adjustments.map((adj) => (
                                    <tr key={adj.id}>
                                      <td>{ADJUSTMENT_TYPE_LABELS[adj.type] || adj.type}</td>
                                      <td>{formatMoney(adj.amountCents, adj.currency)}</td>
                                      <td>{adj.label || '—'}</td>
                                      {isDraft && (
                                        <td>
                                          <button
                                            type="button"
                                            className="icon-btn"
                                            onClick={() => handleDeleteAdjustment(adj.id)}
                                            aria-label="Remove adjustment"
                                          >
                                            <TrashIcon className="h-4 w-4" />
                                          </button>
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            {isDraft && (
                              <form
                                className="flex items-end gap-2"
                                onSubmit={(e) => handleAddAdjustment(e, row.employeeId, row.currency)}
                              >
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                  <label>Type</label>
                                  <select
                                    value={adjustmentForm.type}
                                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, type: e.target.value as PayrollEntryType })}
                                  >
                                    <option value="bonus">Bonus</option>
                                    <option value="commission">Commission</option>
                                    <option value="reimbursement">Reimbursement</option>
                                    <option value="deduction">Deduction</option>
                                  </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                  <label>Amount</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    style={{ width: 100 }}
                                    value={adjustmentForm.amount}
                                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, amount: e.target.value })}
                                    required
                                  />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                  <label>Note</label>
                                  <input
                                    type="text"
                                    value={adjustmentForm.label}
                                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, label: e.target.value })}
                                  />
                                </div>
                                <button type="submit" className="btn-secondary btn-sm" disabled={savingAdjustment}>
                                  Add adjustment
                                </button>
                              </form>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={addPersonModalOpen} title="Add person to this run" onClose={() => setAddPersonModalOpen(false)}>
        {addPersonCandidates.length === 0 ? (
          <p className="text-sm text-ink-muted">Everyone with an active compensation is already in this run.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {addPersonCandidates.map((entry) => (
              <div key={entry.employeeId} className="flex items-center justify-between gap-3 card" style={{ padding: '0.5rem 0.75rem' }}>
                <span>
                  {entry.employeeFirstName} {entry.employeeLastName}
                  {!entry.currentCompensation && <span className="text-ink-muted"> — no active compensation</span>}
                </span>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={!entry.currentCompensation || addingEmployeeId === entry.employeeId}
                  onClick={() => handleAddPerson(entry.employeeId)}
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
