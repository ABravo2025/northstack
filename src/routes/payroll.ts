import {
  createPayFrequency,
  findPayFrequencyById,
  listPayFrequencies,
  updatePayFrequency,
} from '../modules/hr/payFrequencyService.js';
import { createCompensation, listCompensationHistory } from '../modules/hr/employeeCompensationService.js';
import { addPersonToRun, confirmRun, createRun, getRunDetail, listRuns } from '../modules/hr/payrollRunService.js';
import {
  createAdjustment,
  createOffCyclePayments,
  deleteAdjustment,
  updateHourlyBaseEntryHours,
} from '../modules/hr/payrollEntryService.js';
import { findEmployeeByUserId, findEmployeeById } from '../modules/hr/employeeService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const payrollRouter = createAsyncRouter();

// Payroll V1 (Tier 3.5) — see docs/tareas-desarrollo.md, "Payroll (Tier 3.5) —
// spec técnico completo". Visibility is owner-only across the whole section
// by default (compensation data), except an employee viewing their own
// EmployeeCompensation history (added in Unidad 4) — not a blanket rule for
// every endpoint in this router.

const PAY_FREQUENCY_CADENCES = ['weekly', 'biweekly', 'monthly'];

payrollRouter.get('/api/hr/pay-frequencies', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (user.role !== 'owner') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const frequencies = await listPayFrequencies(user.tenantId!);
  return res.json(frequencies);
});

payrollRouter.post('/api/hr/pay-frequencies', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (user.role !== 'owner') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const cadence = req.body.cadence;
  const payAnchor = typeof req.body.payAnchor === 'string' ? req.body.payAnchor.trim() : '';
  if (!name || !PAY_FREQUENCY_CADENCES.includes(cadence) || !payAnchor) {
    return res.status(400).json({ error: 'name, a valid cadence, and payAnchor are required' });
  }

  const frequency = await createPayFrequency({
    tenantId: user.tenantId!,
    name,
    cadence,
    payAnchor,
    order: req.body.order,
  });
  return res.status(201).json(frequency);
});

payrollRouter.patch('/api/hr/pay-frequencies/:frequencyId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (user.role !== 'owner') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const existing = await findPayFrequencyById(req.params.frequencyId);
  if (!existing || existing.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Pay frequency not found' });
  }

  if (req.body.cadence !== undefined && !PAY_FREQUENCY_CADENCES.includes(req.body.cadence)) {
    return res.status(400).json({ error: 'Invalid cadence' });
  }

  const result = await updatePayFrequency(req.params.frequencyId, user.tenantId!, {
    name: req.body.name,
    cadence: req.body.cadence,
    payAnchor: req.body.payAnchor,
    isActive: req.body.isActive,
    order: req.body.order,
  });
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result.frequency);
});

const COMPENSATION_TYPES = ['hourly', 'fixed'];

payrollRouter.get('/api/hr/employees/:employeeId/compensation', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const isOwnerOrAdmin = user.role === 'owner' || user.role === 'admin';
  if (!isOwnerOrAdmin) {
    const actingEmployee = await findEmployeeByUserId(user.id);
    if (!actingEmployee || actingEmployee.id !== employee.id) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
  }

  const history = await listCompensationHistory(user.tenantId!, employee.id);
  return res.json(history);
});

payrollRouter.post('/api/hr/employees/:employeeId/compensation', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (user.role !== 'owner') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const { compensationType, rateCents, currency, payFrequencyId, effectiveFrom, note } = req.body;
  if (!COMPENSATION_TYPES.includes(compensationType) || !currency || !payFrequencyId || !effectiveFrom) {
    return res
      .status(400)
      .json({ error: 'compensationType, rateCents, currency, payFrequencyId, and effectiveFrom are required' });
  }

  const result = await createCompensation({
    tenantId: user.tenantId!,
    employeeId: employee.id,
    compensationType,
    rateCents,
    currency,
    payFrequencyId,
    effectiveFrom,
    note: note || undefined,
    createdByUserId: user.id,
  });
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json(result.compensation);
});

payrollRouter.get('/api/hr/payroll/runs', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (user.role !== 'owner') {
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
  if (user.role !== 'owner') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const { payFrequencyId, periodLabel } = req.body;
  if (!payFrequencyId || typeof periodLabel !== 'string' || !periodLabel.trim()) {
    return res.status(400).json({ error: 'payFrequencyId and periodLabel are required' });
  }

  const result = await createRun(user.tenantId!, payFrequencyId, periodLabel, user.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json(result.run);
});

payrollRouter.get('/api/hr/payroll/runs/:runId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (user.role !== 'owner') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const run = await getRunDetail(user.tenantId!, req.params.runId);
  if (!run) {
    return res.status(404).json({ error: 'Payroll run not found' });
  }
  return res.json(run);
});

payrollRouter.post('/api/hr/payroll/entries', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (user.role !== 'owner') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const { runId, employeeId, type, amountCents, currency, label } = req.body;
  if (!runId || !employeeId || !type || !currency) {
    return res.status(400).json({ error: 'runId, employeeId, type, amountCents, and currency are required' });
  }

  const result = await createAdjustment({
    tenantId: user.tenantId!,
    runId,
    employeeId,
    type,
    amountCents,
    currency,
    label,
  });
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json(result.entry);
});

payrollRouter.delete('/api/hr/payroll/entries/:entryId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (user.role !== 'owner') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await deleteAdjustment(req.params.entryId, user.tenantId!);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(204).end();
});

payrollRouter.patch('/api/hr/payroll/entries/:entryId/hours', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (user.role !== 'owner') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const hoursQty = Number(req.body.hoursQty);
  const result = await updateHourlyBaseEntryHours(req.params.entryId, user.tenantId!, hoursQty);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result.entry);
});

payrollRouter.post('/api/hr/payroll/runs/:runId/confirm', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (user.role !== 'owner') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await confirmRun(user.tenantId!, req.params.runId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result.run);
});

payrollRouter.post('/api/hr/payroll/runs/:runId/employees', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (user.role !== 'owner') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (!req.body.employeeId) {
    return res.status(400).json({ error: 'employeeId is required' });
  }

  const result = await addPersonToRun(user.tenantId!, req.params.runId, req.body.employeeId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json(result.entry);
});

payrollRouter.post('/api/hr/payroll/off-payments', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (user.role !== 'owner') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const { type, currency, paymentDate, payments } = req.body;
  if (!type || !currency || !paymentDate || !Array.isArray(payments)) {
    return res.status(400).json({ error: 'type, currency, paymentDate, and payments are required' });
  }

  const result = await createOffCyclePayments({
    tenantId: user.tenantId!,
    type,
    currency,
    paymentDate,
    payments,
  });
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json(result.entries);
});
