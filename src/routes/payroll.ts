import {
  createPayFrequency,
  findPayFrequencyById,
  isValidAnchorConfig,
  listPayFrequencies,
  updatePayFrequency,
} from '../modules/hr/payFrequencyService.js';
import {
  confirmCompensation,
  createCompensation,
  findBlockingUnconfirmedCompensation,
  listCompensationHistory,
} from '../modules/hr/employeeCompensationService.js';
import { addPersonToRun, confirmRun, createRun, getRunDetail, listRuns } from '../modules/hr/payrollRunService.js';
import { generatePayslipPdf } from '../modules/hr/payslipService.js';
import {
  createAdjustment,
  createOffCyclePayments,
  deleteAdjustment,
  listOffCyclePayments,
  updateHourlyBaseEntryHours,
} from '../modules/hr/payrollEntryService.js';
import { findEmployeeByUserId, findEmployeeById } from '../modules/hr/employeeService.js';
import { findUserById } from '../modules/tenant/tenantService.js';
import { sendCompensationConfirmationEmail } from '../lib/mailer.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const payrollRouter = createAsyncRouter();

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

// Payroll V1 (Tier 3.5) — see docs/tareas-desarrollo.md, "Payroll (Tier 3.5) —
// spec técnico completo". Visibility is owner-only across the whole section
// by default (compensation data), except an employee viewing their own
// EmployeeCompensation history (added in Unidad 4) — not a blanket rule for
// every endpoint in this router.

const PAY_FREQUENCY_CADENCES = ['weekly', 'semimonthly', 'monthly'];
const DUE_DATE_OFFSETS = ['same_day', 'plus_2', 'plus_5', 'custom'];

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

// Shared shape check for anchorConfig/dueDateOffset/dueDateCustomDays,
// used by both create and update below. `cadence` is passed explicitly
// since on update it may come from req.body or fall back to the existing
// row's cadence — isValidAnchorConfig always needs to know which shape to
// expect.
function parsePayFrequencyAnchor(
  body: any,
  cadence: string,
): { anchorConfig: string; dueDateOffset: string; dueDateCustomDays?: number } | { error: string } {
  let parsedAnchorConfig: unknown;
  try {
    parsedAnchorConfig = typeof body.anchorConfig === 'string' ? JSON.parse(body.anchorConfig) : body.anchorConfig;
  } catch {
    return { error: 'anchorConfig must be valid JSON' };
  }
  if (!isValidAnchorConfig(cadence as any, parsedAnchorConfig)) {
    return { error: 'anchorConfig does not match the selected cadence' };
  }
  const dueDateOffset = body.dueDateOffset;
  if (!DUE_DATE_OFFSETS.includes(dueDateOffset)) {
    return { error: 'Invalid dueDateOffset' };
  }
  if (dueDateOffset === 'custom' && !Number.isInteger(body.dueDateCustomDays)) {
    return { error: 'dueDateCustomDays is required when dueDateOffset is custom' };
  }
  return {
    anchorConfig: JSON.stringify(parsedAnchorConfig),
    dueDateOffset,
    dueDateCustomDays: dueDateOffset === 'custom' ? body.dueDateCustomDays : undefined,
  };
}

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
  if (!name || !PAY_FREQUENCY_CADENCES.includes(cadence)) {
    return res.status(400).json({ error: 'name and a valid cadence are required' });
  }
  const anchor = parsePayFrequencyAnchor(req.body, cadence);
  if ('error' in anchor) {
    return res.status(400).json({ error: anchor.error });
  }

  const frequency = await createPayFrequency({
    tenantId: user.tenantId!,
    name,
    cadence,
    anchorConfig: anchor.anchorConfig,
    dueDateOffset: anchor.dueDateOffset as any,
    dueDateCustomDays: anchor.dueDateCustomDays,
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

  let anchor: { anchorConfig: string; dueDateOffset: string; dueDateCustomDays?: number } | undefined;
  if (req.body.anchorConfig !== undefined || req.body.dueDateOffset !== undefined) {
    const cadence = req.body.cadence ?? existing.cadence;
    const parsed = parsePayFrequencyAnchor(req.body, cadence);
    if ('error' in parsed) {
      return res.status(400).json({ error: parsed.error });
    }
    anchor = parsed;
  }

  const result = await updatePayFrequency(req.params.frequencyId, user.tenantId!, {
    name: req.body.name,
    cadence: req.body.cadence,
    anchorConfig: anchor?.anchorConfig,
    dueDateOffset: anchor?.dueDateOffset as any,
    dueDateCustomDays: anchor?.dueDateCustomDays,
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

  // Unidad 5.3 — only notify if the employee already has an account; someone
  // without one yet sees the same pending-confirmation banner the first time
  // they log in after accepting their invite, no separate email needed.
  if (result.compensation!.blocksParticipation && employee.userId) {
    findUserById(employee.userId)
      .then((employeeUser) => {
        if (!employeeUser) return;
        return sendCompensationConfirmationEmail({
          to: employeeUser.email,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          compensationType: result.compensation!.compensationType,
          rateFormatted: formatMoney(result.compensation!.rateCents, result.compensation!.currency),
          payFrequencyName: result.compensation!.payFrequency.name,
        });
      })
      .catch((error) => {
        console.error('Failed to send compensation confirmation email:', error);
      });
  }

  return res.status(201).json(result.compensation);
});

payrollRouter.post('/api/hr/employees/:employeeId/compensation/:compensationId/confirm', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  // Only the employee themselves confirms their own contract — never
  // owner/admin on their behalf, that would defeat the point of confirming.
  const actingEmployee = await findEmployeeByUserId(user.id);
  if (!actingEmployee || actingEmployee.id !== employee.id) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await confirmCompensation(user.tenantId!, employee.id, req.params.compensationId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result.compensation);
});

// Current-user-scoped: the pending-confirmation banner on Overview calls
// this to find out if it has anything to show, without needing the caller's
// own employeeId up front.
payrollRouter.get('/api/hr/compensation/pending-confirmation', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const actingEmployee = await findEmployeeByUserId(user.id);
  if (!actingEmployee) {
    return res.json(null);
  }

  const pending = await findBlockingUnconfirmedCompensation(user.tenantId!, actingEmployee.id);
  return res.json(pending);
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
  return res.status(201).json({ ...result.run, excludedForUnconfirmedContract: result.excludedForUnconfirmedContract ?? 0 });
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

payrollRouter.get('/api/hr/payroll/off-payments', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (user.role !== 'owner') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const payments = await listOffCyclePayments(user.tenantId!);
  return res.json(payments);
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

payrollRouter.get('/api/hr/payroll/runs/:runId/employees/:employeeId/payslip', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (user.role !== 'owner') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await generatePayslipPdf(user.tenantId!, req.params.runId, req.params.employeeId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="payslip-preview.pdf"');
  return res.send(result.pdf);
});
