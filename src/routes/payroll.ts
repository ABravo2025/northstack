import { canManagePayroll } from '../modules/auth/permissionService.js';
import {
  createPayFrequency,
  findPayFrequencyById,
  listPayFrequenciesWithAssignedCount,
  updatePayFrequency,
} from '../modules/hr/payFrequencyService.js';
import {
  createPaymentMethod,
  findPaymentMethodById,
  listPaymentMethods,
  updatePaymentMethod,
} from '../modules/hr/paymentMethodService.js';
import {
  createCompensation,
  createCompensationBulk,
  getCompensationStatus,
} from '../modules/hr/employeeCompensationService.js';
import { findEmployeeById } from '../modules/hr/employeeService.js';
import {
  addEmployeeToRun,
  confirmRun,
  createRun,
  getRunDetail,
  listRuns,
} from '../modules/hr/payrollRunService.js';
import { createAdjustment, deleteEntry, updateEntryHours } from '../modules/hr/payrollEntryService.js';
import { createOffPayments, listOffPayments } from '../modules/hr/payrollOffPaymentService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

const VALID_PAYROLL_COMPENSATION_TYPES = ['hourly', 'fixed'];

export const payrollRouter = createAsyncRouter();

// --- Pay frequencies ------------------------------------------------------
// GET is open to any authenticated tenant member (same as /api/status-definitions) —
// only creating/editing the catalog is owner-only, per docs/spec-payroll.md Unidad 2.

payrollRouter.get('/api/hr/pay-frequencies', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const frequencies = await listPayFrequenciesWithAssignedCount(user.tenantId!);
  return res.json(frequencies);
});

payrollRouter.post('/api/hr/pay-frequencies', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManagePayroll(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const name = (req.body.name as string)?.trim();
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!req.body.cadence || !req.body.anchorConfig) {
    return res.status(400).json({ error: 'Cadence and anchorConfig are required' });
  }

  const frequency = await createPayFrequency({
    tenantId: user.tenantId!,
    name,
    cadence: req.body.cadence,
    anchorConfig: req.body.anchorConfig,
    dueDateOffset: req.body.dueDateOffset,
    dueDateCustomDays: req.body.dueDateCustomDays,
  });
  return res.status(201).json(frequency);
});

payrollRouter.patch('/api/hr/pay-frequencies/:id', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManagePayroll(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const existing = await findPayFrequencyById(req.params.id);
  if (!existing || existing.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Pay frequency not found' });
  }

  const result = await updatePayFrequency(req.params.id, user.tenantId!, {
    name: req.body.name,
    cadence: req.body.cadence,
    anchorConfig: req.body.anchorConfig,
    dueDateOffset: req.body.dueDateOffset,
    dueDateCustomDays: req.body.dueDateCustomDays,
    isActive: req.body.isActive,
    order: req.body.order,
  });
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result.payFrequency);
});

// --- Payment methods -------------------------------------------------------

payrollRouter.get('/api/hr/payment-methods', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const methods = await listPaymentMethods(user.tenantId!);
  return res.json(methods);
});

payrollRouter.post('/api/hr/payment-methods', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManagePayroll(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const name = (req.body.name as string)?.trim();
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const method = await createPaymentMethod({ tenantId: user.tenantId!, name });
  return res.status(201).json(method);
});

payrollRouter.patch('/api/hr/payment-methods/:id', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManagePayroll(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const existing = await findPaymentMethodById(req.params.id);
  if (!existing || existing.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Payment method not found' });
  }

  const result = await updatePaymentMethod(req.params.id, user.tenantId!, {
    name: req.body.name,
    isActive: req.body.isActive,
    order: req.body.order,
  });
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result.paymentMethod);
});

// --- Employee compensation (Unidad 5) --------------------------------------
// Owner-only, same as the rest of Payroll — the person themselves never hits
// this endpoint (their side of the contract is Unidad 7's public flow).

payrollRouter.post('/api/hr/payroll/compensation', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManagePayroll(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.body.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(400).json({ error: 'Employee not found' });
  }

  if (!VALID_PAYROLL_COMPENSATION_TYPES.includes(req.body.compensationType)) {
    return res.status(400).json({ error: 'Invalid compensation type' });
  }

  if (!Number.isInteger(req.body.rateCents) || req.body.rateCents < 0) {
    return res.status(400).json({ error: 'rateCents must be a non-negative integer' });
  }

  if (!Intl.supportedValuesOf('currency').includes(req.body.currency)) {
    return res.status(400).json({ error: 'Invalid currency code' });
  }

  const payFrequency = await findPayFrequencyById(req.body.payFrequencyId);
  if (!payFrequency || payFrequency.tenantId !== user.tenantId) {
    return res.status(400).json({ error: 'Pay frequency not found' });
  }

  if (!req.body.jobTitle?.trim() || !req.body.description?.trim() || !req.body.effectiveFrom) {
    return res.status(400).json({ error: 'jobTitle, description, and effectiveFrom are required' });
  }

  const result = await createCompensation({
    tenantId: user.tenantId!,
    employeeId: employee.id,
    compensationType: req.body.compensationType,
    rateCents: req.body.rateCents,
    currency: req.body.currency,
    payFrequencyId: req.body.payFrequencyId,
    jobTitle: req.body.jobTitle.trim(),
    description: req.body.description.trim(),
    effectiveFrom: req.body.effectiveFrom,
    note: req.body.note || null,
    createdByUserId: user.id,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json(result.compensation);
});

// --- Bulk assign/reassign (Unidad 10) — exception tool, owner-only --------

payrollRouter.get('/api/hr/payroll/compensation/status', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManagePayroll(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const status = await getCompensationStatus(user.tenantId!);
  return res.json(status);
});

payrollRouter.post('/api/hr/payroll/compensation/bulk', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManagePayroll(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const payFrequency = await findPayFrequencyById(req.body.payFrequencyId);
  if (!payFrequency || payFrequency.tenantId !== user.tenantId) {
    return res.status(400).json({ error: 'Pay frequency not found' });
  }

  if (!Array.isArray(req.body.entries) || req.body.entries.length === 0) {
    return res.status(400).json({ error: 'entries must be a non-empty array' });
  }

  for (const entry of req.body.entries) {
    const employee = await findEmployeeById(entry.employeeId);
    if (!employee || employee.tenantId !== user.tenantId) {
      return res.status(400).json({ error: `Employee ${entry.employeeId} not found` });
    }
    if (!VALID_PAYROLL_COMPENSATION_TYPES.includes(entry.compensationType)) {
      return res.status(400).json({ error: `Invalid compensation type for employee ${entry.employeeId}` });
    }
    if (!Number.isInteger(entry.rateCents) || entry.rateCents < 0) {
      return res.status(400).json({ error: `Invalid rateCents for employee ${entry.employeeId}` });
    }
  }

  const results = await createCompensationBulk({
    tenantId: user.tenantId!,
    payFrequencyId: req.body.payFrequencyId,
    effectiveFrom: req.body.effectiveFrom,
    createdByUserId: user.id,
    entries: req.body.entries.map((entry: any) => ({
      employeeId: entry.employeeId,
      compensationType: entry.compensationType,
      rateCents: entry.rateCents,
      currency: entry.currency,
      jobTitle: entry.jobTitle.trim(),
      description: entry.description.trim(),
    })),
  });

  return res.status(201).json(results);
});

// --- Payroll Runs (Unidad 12/13/16/17) — owner-only, real $ amounts -------

payrollRouter.get('/api/hr/payroll/runs', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canManagePayroll(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const runs = await listRuns(user.tenantId!);
  return res.json(runs);
});

payrollRouter.post('/api/hr/payroll/runs', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canManagePayroll(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (!req.body.periodLabel?.trim()) {
    return res.status(400).json({ error: 'periodLabel is required' });
  }

  const result = await createRun({
    tenantId: user.tenantId!,
    payFrequencyId: req.body.payFrequencyId,
    periodLabel: req.body.periodLabel.trim(),
    createdByUserId: user.id,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json(result.run);
});

payrollRouter.get('/api/hr/payroll/runs/:id', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canManagePayroll(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await getRunDetail(user.tenantId!, req.params.id);
  if (!result.success) {
    return res.status(404).json({ error: result.error });
  }
  return res.json(result.detail);
});

payrollRouter.post('/api/hr/payroll/runs/:id/employees', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canManagePayroll(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.body.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(400).json({ error: 'Employee not found' });
  }

  const result = await addEmployeeToRun(user.tenantId!, req.params.id, req.body.employeeId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json({ success: true });
});

payrollRouter.post('/api/hr/payroll/runs/:id/confirm', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canManagePayroll(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await confirmRun(user.tenantId!, req.params.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result.run);
});

// --- Payroll entries: adjustments (Unidad 14) + hours (Unidad 15) --------

const VALID_ADJUSTMENT_TYPES = ['bonus', 'commission', 'reimbursement', 'deduction'];

payrollRouter.post('/api/hr/payroll/entries', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canManagePayroll(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (!VALID_ADJUSTMENT_TYPES.includes(req.body.type)) {
    return res.status(400).json({ error: 'Invalid adjustment type' });
  }
  if (!Number.isInteger(req.body.amountCents)) {
    return res.status(400).json({ error: 'amountCents must be an integer (deductions may be negative)' });
  }

  const employee = await findEmployeeById(req.body.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(400).json({ error: 'Employee not found' });
  }

  const result = await createAdjustment({
    tenantId: user.tenantId!,
    runId: req.body.runId,
    employeeId: req.body.employeeId,
    type: req.body.type,
    amountCents: req.body.amountCents,
    currency: req.body.currency,
    label: req.body.label || null,
    paymentDate: req.body.paymentDate,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json(result.entry);
});

payrollRouter.delete('/api/hr/payroll/entries/:id', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canManagePayroll(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await deleteEntry(user.tenantId!, req.params.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(204).send();
});

payrollRouter.patch('/api/hr/payroll/entries/:id/hours', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canManagePayroll(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await updateEntryHours(user.tenantId!, req.params.id, Number(req.body.hoursQty));
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result.entry);
});

// --- Off-cycle payments (Unidad 18) ----------------------------------------

payrollRouter.get('/api/hr/payroll/off-payments', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canManagePayroll(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const entries = await listOffPayments(user.tenantId!);
  return res.json(entries);
});

payrollRouter.post('/api/hr/payroll/off-payments', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canManagePayroll(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (!Array.isArray(req.body.entries) || req.body.entries.length === 0) {
    return res.status(400).json({ error: 'entries must be a non-empty array' });
  }
  if (!VALID_ADJUSTMENT_TYPES.includes(req.body.type) && req.body.type !== 'base') {
    return res.status(400).json({ error: 'Invalid entry type' });
  }
  if (!req.body.paymentDate) {
    return res.status(400).json({ error: 'paymentDate is required' });
  }

  for (const entry of req.body.entries) {
    const employee = await findEmployeeById(entry.employeeId);
    if (!employee || employee.tenantId !== user.tenantId) {
      return res.status(400).json({ error: `Employee ${entry.employeeId} not found` });
    }
  }

  const results = await createOffPayments({
    tenantId: user.tenantId!,
    type: req.body.type,
    paymentDate: req.body.paymentDate,
    entries: req.body.entries.map((entry: any) => ({
      employeeId: entry.employeeId,
      amountCents: entry.amountCents,
      currency: entry.currency,
      label: entry.label || null,
    })),
  });

  return res.status(201).json(results);
});
