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
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

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
