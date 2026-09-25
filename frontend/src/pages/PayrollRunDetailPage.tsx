import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import type { CompensationStatusEntry, PayrollEntryType, RunDetail } from '../api';
import { useToast } from '../components/common/ToastProvider';
import Modal from '../components/common/Modal';
import TableSkeleton from '../components/common/TableSkeleton';
import StatusChip from '../components/common/StatusChip';
import PayslipPreviewModal from '../components/payroll/PayslipPreviewModal';
import HorizontalScrollbar from '../components/entity-views/HorizontalScrollbar';
import { formatMoney } from '../lib/currencies';
import { ChevronDownIcon, ChevronLeftIcon, EyeIcon, PlusIcon, TrashIcon } from '../components/common/Icons';
import { usePermissions } from '../contexts/PermissionsContext';

interface PayrollRunDetailPageProps {
  token: string;
}

export default function PayrollRunDetailPage({ token }: PayrollRunDetailPageProps) {
  const { t } = useTranslation('hr');
  // Custom Roles Fase J — migrated off `user?.role === 'owner'` to the real backend gate,
  // canManagePayroll, same as PayrollPage.tsx.
  const permissions = usePermissions();
  const canManagePayroll = permissions.has('manage_payroll');
  const toast = useToast();
  const navigate = useNavigate();
  const { runId } = useParams<{ runId: string }>();
  const tableWrapRef = useRef<HTMLDivElement>(null);
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
  const [payslipEmployeeId, setPayslipEmployeeId] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const load = async () => {
    if (!runId || !canManagePayroll) {
      setLoading(false);
      return;
    }
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
      toast.success(t('payroll.runDetail.toasts.runConfirmed'));
      load();
    } catch (error) {
      toast.error(t('payroll.runDetail.toasts.confirmFailed', { error: (error as Error).message }));
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
      toast.error(t('payroll.runDetail.toasts.hoursUpdateFailed', { error: (error as Error).message }));
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
      toast.success(t('payroll.runDetail.toasts.adjustmentAdded'));
      load();
    } catch (error) {
      toast.error(t('payroll.runDetail.toasts.adjustmentAddFailed', { error: (error as Error).message }));
    } finally {
      setSavingAdjustment(false);
    }
  };

  const handleDeleteAdjustment = async (entryId: string) => {
    try {
      await api.deletePayrollEntry(token, entryId);
      toast.success(t('payroll.runDetail.toasts.adjustmentRemoved'));
      load();
    } catch (error) {
      toast.error(t('payroll.runDetail.toasts.adjustmentRemoveFailed', { error: (error as Error).message }));
    }
  };

  const openAddPersonModal = async () => {
    try {
      const status = await api.getCompensationStatus(token);
      const includedIds = new Set(detail?.employeeRows.map((r) => r.employeeId));
      const runPayFrequencyName = detail?.run.payFrequency?.name;
      // Only people already on this run's pay frequency — adding someone on
      // a different frequency to a run wouldn't make sense (backlog QA,
      // 2026-08-27). currentCompensation is null for Profile-type people
      // (nothing to pay), so they're excluded too, same as before.
      setAddPersonCandidates(
        status.filter(
          (entry) =>
            !includedIds.has(entry.employeeId) &&
            entry.currentCompensation?.payFrequencyName === runPayFrequencyName,
        ),
      );
      setAddPersonModalOpen(true);
    } catch (error) {
      toast.error(t('payroll.runDetail.toasts.peopleLoadFailed', { error: (error as Error).message }));
    }
  };

  const handleAddPerson = async (employeeId: string) => {
    if (!runId) return;
    setAddingEmployeeId(employeeId);
    try {
      await api.addEmployeeToPayrollRun(token, runId, employeeId);
      toast.success(t('payroll.runDetail.toasts.personAdded'));
      setAddPersonModalOpen(false);
      load();
    } catch (error) {
      toast.error(t('payroll.runDetail.toasts.personAddFailed', { error: (error as Error).message }));
    } finally {
      setAddingEmployeeId(null);
    }
  };

  if (!canManagePayroll) {
    return (
      <div className="container">
        <p className="text-sm text-ink-muted">{t('payroll.runDetail.ownerOnly')}</p>
      </div>
    );
  }

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
        <div className="alert alert-error">{loadError || t('payroll.runDetail.runNotFound')}</div>
      </div>
    );
  }

  const isDraft = detail.run.status === 'draft';

  return (
    <div className="container">
      <div className="page-toolbar">
        <div className="flex items-center gap-2">
          <button type="button" className="icon-btn" onClick={() => navigate('/hr/payroll')} aria-label={t('payroll.runDetail.backAriaLabel')}>
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <h2 className="page-title">{detail.run.periodLabel}</h2>
          <StatusChip
            color={isDraft ? '#9ca3af' : '#059669'}
            label={isDraft ? t('payroll.page.statusLabels.draft') : t('payroll.page.statusLabels.confirmed')}
          />
        </div>
        {isDraft && (
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary gap-1.5" onClick={openAddPersonModal}>
              <PlusIcon className="h-3.5 w-3.5" />
              {t('payroll.runDetail.addPersonToRun')}
            </button>
            <span title={detail.hasUnloadedHours ? t('payroll.runDetail.confirmDisabledTooltip') : undefined}>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmRun}
                disabled={confirming || detail.hasUnloadedHours}
              >
                {confirming ? t('payroll.runDetail.confirming') : t('payroll.runDetail.confirmRun')}
              </button>
            </span>
          </div>
        )}
      </div>

      <p className="text-sm text-ink-muted mb-3">
        {t('payroll.runDetail.payFrequencyLabel', { name: detail.run.payFrequency?.name || '—' })}
      </p>

      {detail.excludedCount > 0 && (
        <div className="alert alert-error mb-3">
          {t('payroll.runDetail.excludedNotice', { count: detail.excludedCount })}
        </div>
      )}

      {detail.employeeRows.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('payroll.runDetail.noOneInRun')}</p>
      ) : (
        <div className="full-table-wrap" ref={tableWrapRef}>
          <table className="table full-table">
            <thead>
              <tr>
                <th style={{ width: 16 }}></th>
                <th>{t('payroll.runDetail.columns.name')}</th>
                <th>{t('payroll.runDetail.columns.type')}</th>
                <th>{t('payroll.runDetail.columns.base')}</th>
                <th>{t('payroll.runDetail.columns.adjustments')}</th>
                <th>{t('payroll.runDetail.columns.total')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {detail.employeeRows.map((row) => {
                const baseEntry = row.entries.find((e) => e.type === 'base');
                const adjustments = row.entries.filter((e) => e.type !== 'base');
                const isExpanded = expandedEmployeeId === row.employeeId;
                return (
                  <Fragment key={row.employeeId}>
                    <tr className={row.isInactive ? 'table-row-inactive' : ''}>
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
                        <span className="category-chip">
                          {row.compensationType === 'hourly'
                            ? t('payroll.runDetail.compensationTypeLabels.hourly')
                            : t('payroll.runDetail.compensationTypeLabels.fixed')}
                        </span>
                      </td>
                      <td>
                        {row.compensationType === 'fixed' ? (
                          formatMoney(row.baseAmountCents, row.currency)
                        ) : isDraft ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <label className="text-xs text-ink-muted" htmlFor={`hours-${row.employeeId}`}>
                                {t('payroll.runDetail.hoursLabel')}
                              </label>
                              <input
                                id={`hours-${row.employeeId}`}
                                type="number"
                                step="0.25"
                                min="0"
                                className="select-compact"
                                style={{ width: 72 }}
                                value={hoursDrafts[row.employeeId] ?? ''}
                                onChange={(e) => setHoursDrafts({ ...hoursDrafts, [row.employeeId]: e.target.value })}
                                onBlur={() => handleSaveHours(row.employeeId)}
                              />
                            </div>
                            <span className="text-xs text-ink-muted">
                              {t('payroll.runDetail.rateBaseLine', {
                                rate: formatMoney(row.rateCents, row.currency),
                                base: formatMoney(row.baseAmountCents, row.currency),
                              })}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5 text-xs text-ink-muted">
                            <span>{t('payroll.runDetail.hoursLine', { hours: baseEntry?.hoursQty ?? 0 })}</span>
                            <span>
                              {t('payroll.runDetail.rateBaseLine', {
                                rate: formatMoney(row.rateCents, row.currency),
                                base: formatMoney(row.baseAmountCents, row.currency),
                              })}
                            </span>
                          </div>
                        )}
                      </td>
                      <td>
                        <button type="button" className="btn-secondary btn-sm" onClick={() => toggleExpanded(row.employeeId)}>
                          {row.adjustmentsTotalCents === 0
                            ? t('payroll.runDetail.adjustmentsButton')
                            : `${row.adjustmentsTotalCents > 0 ? '+' : ''}${formatMoney(row.adjustmentsTotalCents, row.currency)}`}
                          <ChevronDownIcon className={`h-3 w-3 ml-1 inline-block transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </td>
                      <td>
                        <strong>{formatMoney(row.totalCents, row.currency)}</strong>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => setPayslipEmployeeId(row.employeeId)}
                          aria-label={t('payroll.runDetail.payslipPreviewAriaLabel', {
                            name: `${row.employeeFirstName} ${row.employeeLastName}`,
                          })}
                        >
                          <span className="tip">{t('payroll.runDetail.payslipPreviewTooltip')}</span>
                          <EyeIcon className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                    {row.isInactive && (
                      <tr>
                        <td colSpan={7} style={{ padding: 0 }}>
                          <div className="alert alert-error" style={{ margin: '0 0 0.5rem 0' }}>
                            {t('payroll.runDetail.inactiveNotice', {
                              name: `${row.employeeFirstName} ${row.employeeLastName}`,
                              status: row.statusName,
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                    {isExpanded && (
                      <tr>
                        <td colSpan={7}>
                          <div className="card" style={{ padding: '0.75rem 1rem' }}>
                            {adjustments.length > 0 && (
                              <table className="table" style={{ marginBottom: '0.75rem' }}>
                                <thead>
                                  <tr>
                                    <th>{t('payroll.runDetail.adjustmentsTable.type')}</th>
                                    <th>{t('payroll.runDetail.adjustmentsTable.amount')}</th>
                                    <th>{t('payroll.runDetail.adjustmentsTable.note')}</th>
                                    {isDraft && <th></th>}
                                  </tr>
                                </thead>
                                <tbody>
                                  {adjustments.map((adj) => (
                                    <tr key={adj.id}>
                                      <td>{t(`payroll.runDetail.adjustmentForm.typeOptions.${adj.type}`, { defaultValue: adj.type })}</td>
                                      <td>{formatMoney(adj.amountCents, adj.currency)}</td>
                                      <td>{adj.label || '—'}</td>
                                      {isDraft && (
                                        <td>
                                          <button
                                            type="button"
                                            className="icon-btn"
                                            onClick={() => handleDeleteAdjustment(adj.id)}
                                            aria-label={t('payroll.runDetail.adjustmentsTable.removeAriaLabel')}
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
                                  <label>{t('payroll.runDetail.adjustmentForm.typeLabel')}</label>
                                  <select
                                    value={adjustmentForm.type}
                                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, type: e.target.value as PayrollEntryType })}
                                  >
                                    <option value="bonus">{t('payroll.runDetail.adjustmentForm.typeOptions.bonus')}</option>
                                    <option value="commission">{t('payroll.runDetail.adjustmentForm.typeOptions.commission')}</option>
                                    <option value="reimbursement">{t('payroll.runDetail.adjustmentForm.typeOptions.reimbursement')}</option>
                                    <option value="deduction">{t('payroll.runDetail.adjustmentForm.typeOptions.deduction')}</option>
                                  </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                  <label>{t('payroll.runDetail.adjustmentForm.amountLabel')}</label>
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
                                  <label>{t('payroll.runDetail.adjustmentForm.noteLabel')}</label>
                                  <input
                                    type="text"
                                    value={adjustmentForm.label}
                                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, label: e.target.value })}
                                  />
                                </div>
                                <button type="submit" className="btn-secondary btn-sm" disabled={savingAdjustment}>
                                  {t('payroll.runDetail.adjustmentForm.addAdjustment')}
                                </button>
                              </form>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <HorizontalScrollbar targetRef={tableWrapRef} />

      <Modal
        open={addPersonModalOpen}
        title={t('payroll.runDetail.addPersonModal.title')}
        onClose={() => setAddPersonModalOpen(false)}
      >
        {addPersonCandidates.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {t('payroll.runDetail.addPersonModal.emptyMessage', {
              payFrequency: detail.run.payFrequency?.name ?? t('payroll.runDetail.addPersonModal.fallbackPayFrequency'),
            })}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {addPersonCandidates.map((entry) => (
              <div key={entry.employeeId} className="flex items-center justify-between gap-3 card" style={{ padding: '0.5rem 0.75rem' }}>
                <span>
                  {entry.employeeFirstName} {entry.employeeLastName}
                  {!entry.currentCompensation && (
                    <span className="text-ink-muted">{t('payroll.runDetail.addPersonModal.noActiveCompensationNote')}</span>
                  )}
                </span>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={!entry.currentCompensation || addingEmployeeId === entry.employeeId}
                  onClick={() => handleAddPerson(entry.employeeId)}
                >
                  {t('payroll.runDetail.addPersonModal.add')}
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {payslipEmployeeId && runId && (
        <PayslipPreviewModal
          open={payslipEmployeeId !== null}
          onClose={() => setPayslipEmployeeId(null)}
          fetchPdf={() => api.getRunEmployeePayslip(token, runId, payslipEmployeeId)}
        />
      )}
    </div>
  );
}
