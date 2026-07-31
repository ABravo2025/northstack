import {
  createPayrollEntry,
  deletePayrollEntry,
  findPayrollEntryById,
  listPayrollEntries,
  updatePayrollEntry,
} from '../modules/hr/payrollService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const payrollRouter = createAsyncRouter();

// Permissions: deliberately open to any authenticated tenant member for V1
// (confirmed with the user 2026-07-31) — same open-visibility criterion
// already used for Tasks/Notes, even though payroll amounts are compensation
// data. Flagged explicitly as temporary: revisit once custom roles exist
// (see docs/tareas-desarrollo.md, Tier 5).

payrollRouter.get('/api/hr/payroll-entries', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const entries = await listPayrollEntries(user.tenantId!);
  return res.json(entries);
});

payrollRouter.post('/api/hr/payroll-entries', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const { employeeId, periodStart, periodEnd, amountCents, paymentDate } = req.body;
  if (!employeeId || !periodStart || !periodEnd || amountCents === undefined || !paymentDate) {
    return res
      .status(400)
      .json({ error: 'employeeId, periodStart, periodEnd, amountCents, and paymentDate are required' });
  }

  const result = await createPayrollEntry({
    tenantId: user.tenantId!,
    employeeId,
    periodStart,
    periodEnd,
    amountCents,
    paymentDate,
  });
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json(result.entry);
});

payrollRouter.patch('/api/hr/payroll-entries/:entryId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const existing = await findPayrollEntryById(req.params.entryId);
  if (!existing || existing.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Payroll entry not found' });
  }

  const { employeeId, periodStart, periodEnd, amountCents, paymentDate } = req.body;
  const result = await updatePayrollEntry(req.params.entryId, user.tenantId!, {
    employeeId,
    periodStart,
    periodEnd,
    amountCents,
    paymentDate,
  });
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result.entry);
});

payrollRouter.delete('/api/hr/payroll-entries/:entryId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const existing = await findPayrollEntryById(req.params.entryId);
  if (!existing || existing.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Payroll entry not found' });
  }

  await deletePayrollEntry(req.params.entryId);
  return res.status(204).end();
});
