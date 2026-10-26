import prisma from '../lib/prisma.js';
import { canInviteUsers } from '../modules/auth/permissionService.js';
import { requirePayrollAccess } from '../lib/payrollAccess.js';
import {
  createPayFrequency,
  findPayFrequencyById,
  listPayFrequenciesWithAssignedCount,
  updatePayFrequency,
} from '../modules/hr/payFrequencyService.js';
import { methodsCatalog, setKnownMethod,
  createPaymentMethod,
  findPaymentMethodById,
  listPaymentMethods,
  updatePaymentMethod,
} from '../modules/hr/paymentMethodService.js';
import {
  createCompensation,
  createCompensationBulk,
  getCompensationStatus,
  listTerminatedCompensations,
} from '../modules/hr/employeeCompensationService.js';
import { findEmployeeById } from '../modules/hr/employeeService.js';
import {
  addEmployeeToRun,
  confirmRun,
  createRun,
  getRunDetail,
  listRuns,
  setRunPaymentDate,
} from '../modules/hr/payrollRunService.js';
import { createAdjustment, deleteEntry, updateEntryHours } from '../modules/hr/payrollEntryService.js';
import { createOffPayments, listOffPayments } from '../modules/hr/payrollOffPaymentService.js';
import { issuePayslipsForEntries, issuePayslipsForRun, renderIssuedPayslip, renderRunPreview } from '../modules/hr/payslipV2Service.js';
import { emailPayslip, emailPayslipVoided } from './payslips.js';
import { importApprovedHours } from '../modules/hr/payrollHoursService.js';
import { COST_PERIODS, getPayrollOverview, payrollCost, type CostPeriod } from '../modules/hr/payrollOverviewService.js';
import { getOvertimePolicy, listOvertimePeople, saveOvertimePolicy, setOvertimeExempt } from '../modules/hr/overtimePolicyService.js';
import { TEMPLATES } from '../modules/hr/overtimeRules.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { createSupplementRun, voidAndReissueRun } from '../modules/hr/payrollCorrectionService.js';
import { suggestPayDateForFrequency } from '../modules/hr/payDateService.js';

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

  if (!requirePayrollAccess(user, res)) {
    return;
  }

  const name = (req.body.name as string)?.trim();
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!req.body.cadence || !req.body.anchorConfig) {
    return res.status(400).json({ error: 'Cadence and anchorConfig are required' });
  }

  const frequency = await createPayFrequency(
    {
      tenantId: user.tenantId!,
      name,
      cadence: req.body.cadence,
      anchorConfig: req.body.anchorConfig,
      dueDateOffset: req.body.dueDateOffset,
      dueDateCustomDays: req.body.dueDateCustomDays,
    },
    user.id,
  );
  return res.status(201).json(frequency);
});

payrollRouter.patch('/api/hr/pay-frequencies/:id', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!requirePayrollAccess(user, res)) {
    return;
  }

  const existing = await findPayFrequencyById(req.params.id);
  if (!existing || existing.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Pay frequency not found' });
  }

  const result = await updatePayFrequency(
    req.params.id,
    user.tenantId!,
    {
      name: req.body.name,
      cadence: req.body.cadence,
      anchorConfig: req.body.anchorConfig,
      dueDateOffset: req.body.dueDateOffset,
      dueDateCustomDays: req.body.dueDateCustomDays,
      isActive: req.body.isActive,
      order: req.body.order,
    },
    user.id,
  );
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result.payFrequency);
});

// --- Payment methods -------------------------------------------------------

// Payroll v2 (unit 4): the payment methods grid — every known method plus the company's own.
payrollRouter.get('/api/hr/payment-methods/catalog', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!requirePayrollAccess(user, res)) {
    return;
  }
  return res.json(await methodsCatalog(user.tenantId!));
});

payrollRouter.put('/api/hr/payment-methods/known/:kind', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!requirePayrollAccess(user, res)) {
    return;
  }
  const result = await setKnownMethod(user.tenantId!, req.params.kind, req.body?.active === true, user.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(await methodsCatalog(user.tenantId!));
});

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

  if (!requirePayrollAccess(user, res)) {
    return;
  }

  const name = (req.body.name as string)?.trim();
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const method = await createPaymentMethod({ tenantId: user.tenantId!, name }, user.id);
  return res.status(201).json(method);
});

payrollRouter.patch('/api/hr/payment-methods/:id', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!requirePayrollAccess(user, res)) {
    return;
  }

  const existing = await findPaymentMethodById(req.params.id);
  if (!existing || existing.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Payment method not found' });
  }

  const result = await updatePaymentMethod(
    req.params.id,
    user.tenantId!,
    {
      name: req.body.name,
      isActive: req.body.isActive,
      order: req.body.order,
    },
    user.id,
  );
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

  if (!requirePayrollAccess(user, res)) {
    return;
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

  // Optional platform role for the contract-confirmation invitation (first-ever contract only).
  // Validated here, before anything is written: createCompensation doesn't check createInvitation's
  // result, so a bad role would otherwise leave a contract with no invitation behind it. Choosing a
  // role is an invite decision, so it needs the same permission as the "Invite to app" modal.
  const inviteRoleId = typeof req.body.inviteRoleId === 'string' && req.body.inviteRoleId ? req.body.inviteRoleId : undefined;
  if (inviteRoleId) {
    if (!canInviteUsers(user.roleContext)) {
      return res.status(403).json({ error: 'Insufficient permissions to choose a role' });
    }
    const role = await prisma.role.findUnique({ where: { id: inviteRoleId } });
    if (!role || role.tenantId !== user.tenantId) {
      return res.status(400).json({ error: 'Role not found' });
    }
    if (role.isOwner) {
      return res.status(400).json({ error: 'Ownership can only be transferred to an existing user, not granted by invitation' });
    }
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
    inviteRoleId,
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

  if (!requirePayrollAccess(user, res)) {
    return;
  }

  const status = await getCompensationStatus(user.tenantId!);
  return res.json(status);
});

payrollRouter.get('/api/hr/payroll/compensation/terminated', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!requirePayrollAccess(user, res)) {
    return;
  }

  const terminated = await listTerminatedCompensations(user.tenantId!);
  return res.json(terminated);
});

payrollRouter.post('/api/hr/payroll/compensation/bulk', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!requirePayrollAccess(user, res)) {
    return;
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

// Payroll v2 (spec-payroll-v2.md, unit 2): the overview — latest pay run, recent runs, what's pending.
// Payroll v2 (2026-10-26): what was paid, with the metrics period selector and department filter.
payrollRouter.get('/api/hr/payroll/cost', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user || !requirePayrollAccess(user, res)) return;
  const period = String(req.query.period ?? '90');
  if (!COST_PERIODS.includes(period as CostPeriod)) return res.status(400).json({ error: 'Invalid period' });
  const departmentId = typeof req.query.departmentId === 'string' && req.query.departmentId ? req.query.departmentId : null;
  return res.json(await payrollCost(user.tenantId!, { period: period as CostPeriod, departmentId }));
});

payrollRouter.get('/api/hr/payroll/overview', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!requirePayrollAccess(user, res)) {
    return;
  }
  return res.json(await getPayrollOverview(user.tenantId!));
});

payrollRouter.get('/api/hr/payroll/runs', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!requirePayrollAccess(user, res)) {
    return;
  }

  const runs = await listRuns(user.tenantId!);
  return res.json(runs);
});

payrollRouter.post('/api/hr/payroll/runs', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!requirePayrollAccess(user, res)) {
    return;
  }

  if (!req.body.periodLabel?.trim()) {
    return res.status(400).json({ error: 'periodLabel is required' });
  }

  const result = await createRun({
    tenantId: user.tenantId!,
    payFrequencyId: req.body.payFrequencyId,
    periodLabel: req.body.periodLabel.trim(),
    createdByUserId: user.id,
    paymentDate: typeof req.body.paymentDate === 'string' ? req.body.paymentDate : undefined,
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
  if (!requirePayrollAccess(user, res)) {
    return;
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
  if (!requirePayrollAccess(user, res)) {
    return;
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
  if (!requirePayrollAccess(user, res)) {
    return;
  }

  const result = await confirmRun(user.tenantId!, req.params.id, user.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  // Payroll v2: confirming issues each person's numbered payslip and emails it to them.
  const issued = await issuePayslipsForRun(user.tenantId!, req.params.id);
  for (const id of issued) await emailPayslip(id, user.tenantId!);
  return res.json({ ...result.run, payslipsIssued: issued.length });
});

// Payroll v2 (2026-10-26): real pay date — suggestion for a frequency, and change it on a draft run.
payrollRouter.get('/api/hr/payroll/pay-frequencies/:id/next-pay-date', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user || !requirePayrollAccess(user, res)) return;
  const date = await suggestPayDateForFrequency(user.tenantId!, String(req.params.id));
  if (!date) return res.status(404).json({ error: 'Pay frequency not found' });
  return res.json({ paymentDate: date.toISOString().slice(0, 10) });
});

payrollRouter.patch('/api/hr/payroll/runs/:id/payment-date', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user || !requirePayrollAccess(user, res)) return;
  const result = await setRunPaymentDate(user.tenantId!, String(req.params.id), req.body?.paymentDate, user.id);
  if (!result.success) return res.status(result.error === 'Run not found' ? 404 : 400).json({ error: result.error });
  return res.json(result.run);
});

// Payroll v2 (2026-10-26): fix a confirmed run — void it and reissue, or add a supplement.
payrollRouter.post('/api/hr/payroll/runs/:id/void', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user || !requirePayrollAccess(user, res)) return;
  const result = await voidAndReissueRun(user.tenantId!, String(req.params.id), req.body?.reason, user.id);
  if (!result.success) return res.status(result.error === 'Run not found' ? 404 : 400).json({ error: result.error });
  let emailed = 0;
  for (const id of result.voidedPayslipIds ?? []) if (await emailPayslipVoided(id, user.tenantId!)) emailed++;
  return res.json({ reissueRunId: result.run.id, payslipsVoided: result.voidedPayslipIds?.length ?? 0, emailed });
});

payrollRouter.post('/api/hr/payroll/runs/:id/supplement', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user || !requirePayrollAccess(user, res)) return;
  const result = await createSupplementRun(user.tenantId!, String(req.params.id), req.body?.lines, user.id);
  if (!result.success) return res.status(result.error === 'Run not found' ? 404 : 400).json({ error: result.error });
  return res.status(201).json({ supplementRunId: result.run.id });
});

// --- Payroll entries: adjustments (Unidad 14) + hours (Unidad 15) --------

const VALID_ADJUSTMENT_TYPES = ['bonus', 'commission', 'reimbursement', 'deduction'];

payrollRouter.post('/api/hr/payroll/entries', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!requirePayrollAccess(user, res)) {
    return;
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
  if (!requirePayrollAccess(user, res)) {
    return;
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
  if (!requirePayrollAccess(user, res)) {
    return;
  }

  const result = await updateEntryHours(user.tenantId!, req.params.id, Number(req.body.hoursQty));
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result.entry);
});

// Timesheet → Payroll (2026-10-21): { from, to } → approved timesheet hours into a draft run.
payrollRouter.post('/api/hr/payroll/runs/:runId/import-hours', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!requirePayrollAccess(user, res)) {
    return;
  }
  const result = await importApprovedHours(user.tenantId!, String(req.params.runId), { from: req.body?.from, to: req.body?.to }, user.id, user.locale);
  if (!result.success) {
    return res.status(400).json({ error: result.error, field: result.field });
  }
  return res.json(result.value);
});

// Overtime and surcharges (spec-overtime.md, Growth — Payroll is Growth): the company's rules and
// who doesn't get overtime, in Payroll → Payment policies.
payrollRouter.get('/api/hr/payroll/overtime-policy', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!requirePayrollAccess(user, res)) {
    return;
  }
  const [policy, people] = await Promise.all([getOvertimePolicy(user.tenantId!), listOvertimePeople(user.tenantId!)]);
  return res.json({ policy, people, templates: TEMPLATES });
});

payrollRouter.put('/api/hr/payroll/overtime-policy', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!requirePayrollAccess(user, res)) {
    return;
  }
  const result = await saveOvertimePolicy(user.tenantId!, req.body ?? {});
  if (!result.success) {
    return res.status(400).json({ error: result.error, field: result.field });
  }
  return res.json(result.value);
});

payrollRouter.patch('/api/hr/payroll/overtime-policy/exempt', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!requirePayrollAccess(user, res)) {
    return;
  }
  const result = await setOvertimeExempt(user.tenantId!, req.body?.employeeId, req.body?.exempt);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ ok: true });
});

// --- Off-cycle payments (Unidad 18) ----------------------------------------

payrollRouter.get('/api/hr/payroll/off-payments', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!requirePayrollAccess(user, res)) {
    return;
  }

  const entries = await listOffPayments(user.tenantId!);
  return res.json(entries);
});

payrollRouter.post('/api/hr/payroll/off-payments', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!requirePayrollAccess(user, res)) {
    return;
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

  const results: Awaited<ReturnType<typeof createOffPayments>> = await createOffPayments({
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

  // Payroll v2: a one-off payment is final when made — its payslips are issued (and emailed) now.
  const label = typeof req.body.label === 'string' && req.body.label.trim() ? req.body.label.trim() : req.body.paymentDate;
  const issued = await issuePayslipsForEntries(user.tenantId!, results.map((r) => r.entryId), String(label).slice(0, 80));
  for (const id of issued) await emailPayslip(id, user.tenantId!);
  return res.status(201).json(results);
});

// --- Payslip preview PDF (Unidad 20) ---------------------------------------

payrollRouter.get('/api/hr/payroll/runs/:runId/employees/:employeeId/payslip', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!requirePayrollAccess(user, res)) {
    return;
  }

  // Payroll v2: a confirmed run shows the issued payslip (issued now if it predates v2); a draft,
  // the preview.
  const run = await prisma.payrollRun.findFirst({ where: { id: req.params.runId, tenantId: user.tenantId! } });
  if (!run) {
    return res.status(404).json({ error: 'Run not found' });
  }
  let pdf: Uint8Array | null;
  if (run.status === 'confirmed') {
    await issuePayslipsForRun(user.tenantId!, run.id);
    const p = await prisma.payslip.findFirst({ where: { tenantId: user.tenantId!, runId: run.id, employeeId: req.params.employeeId } });
    pdf = p ? await renderIssuedPayslip(p.id, user.tenantId!) : null;
  } else {
    pdf = await renderRunPreview(user.tenantId!, run.id, req.params.employeeId);
  }
  if (!pdf) {
    return res.status(404).json({ error: 'Payslip not found' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="payslip.pdf"');
  return res.send(Buffer.from(pdf));
});

payrollRouter.get('/api/hr/payroll/entries/:id/payslip', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!requirePayrollAccess(user, res)) {
    return;
  }

  // Payroll v2: the one-off payment's issued payslip (issued now if it predates v2).
  const entry = await prisma.payrollEntry.findFirst({ where: { id: req.params.id, tenantId: user.tenantId!, runId: null } });
  if (!entry) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  let p = await prisma.payslip.findFirst({ where: { tenantId: user.tenantId!, entryIds: { has: entry.id } } });
  if (!p) {
    const [id] = await issuePayslipsForEntries(user.tenantId!, [entry.id], entry.label ?? entry.paymentDate.toISOString().slice(0, 10));
    p = id ? await prisma.payslip.findUnique({ where: { id } }) : null;
  }
  const pdf = p ? await renderIssuedPayslip(p.id, user.tenantId!) : null;
  if (!pdf) {
    return res.status(404).json({ error: 'Payslip not found' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="payslip.pdf"');
  return res.send(Buffer.from(pdf));
});
