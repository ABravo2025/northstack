import { canManageCustomFields } from '../modules/auth/permissionService.js';
import { findEmployeeByUserId } from '../modules/hr/employeeService.js';
import { calculateAllTimeOffBalances } from '../modules/hr/timeOffBalanceService.js';
import { createTimeOffPolicy, listTimeOffPolicies, updateTimeOffPolicy } from '../modules/hr/timeOffPolicyService.js';
import {
  cancelTimeOffRequest,
  createTimeOffRequest,
  decideTimeOffRequest,
  listAllTimeOffRequests,
  listMyTimeOffRequests,
  listPendingApprovals,
  listTimeOffRequestsForCalendar,
} from '../modules/hr/timeOffRequestService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const timeOffRouter = createAsyncRouter();

timeOffRouter.get('/api/time-off-policies', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const policies = await listTimeOffPolicies(user.tenantId!);
  return res.json(policies);
});

timeOffRouter.post('/api/time-off-policies', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const name = req.body.name as string;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const daysPerYear = Number(req.body.daysPerYear);
  if (!Number.isFinite(daysPerYear) || daysPerYear < 0) {
    return res.status(400).json({ error: 'Days per year must be a non-negative number' });
  }

  const policy = await createTimeOffPolicy(
    {
      tenantId: user.tenantId!,
      name: name.trim(),
      color: req.body.color,
      accrualMethod: req.body.accrualMethod,
      daysPerYear,
      isPaid: req.body.isPaid,
      requiresApproval: req.body.requiresApproval,
    },
    user.id,
  );

  return res.status(201).json(policy);
});

timeOffRouter.patch('/api/time-off-policies/:policyId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (req.body.daysPerYear !== undefined) {
    const daysPerYear = Number(req.body.daysPerYear);
    if (!Number.isFinite(daysPerYear) || daysPerYear < 0) {
      return res.status(400).json({ error: 'Days per year must be a non-negative number' });
    }
    req.body.daysPerYear = daysPerYear;
  }

  const result = await updateTimeOffPolicy(
    req.params.policyId,
    user.tenantId!,
    {
      name: req.body.name,
      color: req.body.color,
      accrualMethod: req.body.accrualMethod,
      daysPerYear: req.body.daysPerYear,
      isPaid: req.body.isPaid,
      requiresApproval: req.body.requiresApproval,
      isActive: req.body.isActive,
    },
    user.id,
  );

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json(result.policy);
});

timeOffRouter.post('/api/hr/time-off-requests', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const employee = await findEmployeeByUserId(user.id);
  if (!employee) {
    return res.status(400).json({ error: 'Your account is not linked to an employee record' });
  }

  const result = await createTimeOffRequest(
    {
      tenantId: user.tenantId!,
      employeeId: employee.id,
      timeOffPolicyId: req.body.timeOffPolicyId,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      note: req.body.note,
    },
    user.id,
  );

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json(result.request);
});

timeOffRouter.get('/api/hr/time-off-requests', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const scope = (req.query.scope as string) ?? 'mine';

  if (scope === 'calendar') {
    const requests = await listTimeOffRequestsForCalendar(user.tenantId!);
    return res.json(requests);
  }

  if (scope === 'all') {
    if (!canManageCustomFields(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const requests = await listAllTimeOffRequests(user.tenantId!);
    return res.json(requests);
  }

  const employee = await findEmployeeByUserId(user.id);
  if (!employee) {
    return res.json([]);
  }

  if (scope === 'pending-approval') {
    const requests = await listPendingApprovals(user.tenantId!, employee.id);
    return res.json(requests);
  }

  const requests = await listMyTimeOffRequests(user.tenantId!, employee.id);
  return res.json(requests);
});

timeOffRouter.patch('/api/hr/time-off-requests/:requestId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const decision = req.body.status;
  if (decision !== 'approved' && decision !== 'rejected') {
    return res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
  }

  const result = await decideTimeOffRequest(req.params.requestId, user.tenantId!, user, decision, req.body.decisionNote);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json(result.request);
});

timeOffRouter.delete('/api/hr/time-off-requests/:requestId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const employee = await findEmployeeByUserId(user.id);
  if (!employee) {
    return res.status(400).json({ error: 'Your account is not linked to an employee record' });
  }

  const result = await cancelTimeOffRequest(req.params.requestId, user.tenantId!, employee.id, user.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(204).end();
});

timeOffRouter.get('/api/hr/time-off-balances', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const balances = await calculateAllTimeOffBalances(user.tenantId!);
  return res.json(balances);
});
