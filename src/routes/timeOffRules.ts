import { canManageCustomFields, canManageTenantSettings } from '../modules/auth/permissionService.js';
import { findEmployeeByUserId } from '../modules/hr/employeeService.js';
import { previewTimeOffRequest } from '../modules/hr/timeOffRequestService.js';
import {
  createHoliday,
  deleteHoliday,
  getEmployeeReligions,
  getTimeOffSettings,
  importNationalHolidays,
  listHolidayCountries,
  listHolidays,
  listReligionAssignments,
  setEmployeeReligions,
  updateHoliday,
  updateTimeOffSettings,
} from '../modules/hr/timeOffSettingsService.js';
import { createTimeOffAdjustment, getTimeOffLedger } from '../modules/hr/timeOffAdjustmentService.js';
import { validateSession } from '../lib/httpAuth.js';

type ValidatedUser = NonNullable<Awaited<ReturnType<typeof validateSession>>>;
import { createAsyncRouter } from '../lib/asyncRouter.js';
import prisma from '../lib/prisma.js';

// Time Off company rules (2026-10): Settings → Time Off (holiday calendar, work week, day
// counting, company days off, religious holidays), the request preview, manual balance
// adjustments and each person's ledger.
export const timeOffRulesRouter = createAsyncRouter();

const parseDay = (value: unknown): Date | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Religion is sensitive: HR (whoever manages Time Off policies or the company settings) and the
// person themselves.
const canManageReligions = (user: ValidatedUser) => canManageCustomFields(user.roleContext) || canManageTenantSettings(user.roleContext);

async function isSelf(user: ValidatedUser, employeeId: string): Promise<boolean> {
  const me = await findEmployeeByUserId(user.id);
  return !!me && me.id === employeeId;
}

// ---- Settings ----
timeOffRulesRouter.get('/api/time-off/settings', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  return res.json(await getTimeOffSettings(user.tenantId!));
});

timeOffRulesRouter.patch('/api/time-off/settings', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageTenantSettings(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const result = await updateTimeOffSettings(user.tenantId!, req.body ?? {}, user.id);
  if (!result.success) return res.status(400).json({ error: result.error, field: result.field });
  return res.json(result.value);
});

timeOffRulesRouter.get('/api/time-off/countries', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageTenantSettings(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  try {
    return res.json(await listHolidayCountries());
  } catch (error) {
    return res.status(502).json({ error: (error as Error).message });
  }
});

// ---- Holidays and days off ----
timeOffRulesRouter.get('/api/time-off/holidays', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const year = Number(req.query.year ?? new Date().getFullYear());
  if (!Number.isInteger(year)) return res.status(400).json({ error: 'Invalid year' });
  return res.json(await listHolidays(user.tenantId!, year));
});

timeOffRulesRouter.post('/api/time-off/holidays', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageTenantSettings(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const result = await createHoliday(user.tenantId!, req.body ?? {});
  if (!result.success) return res.status(400).json({ error: result.error, field: result.field });
  return res.status(201).json(result.value);
});

timeOffRulesRouter.post('/api/time-off/holidays/import', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageTenantSettings(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const result = await importNationalHolidays(user.tenantId!, Number(req.body?.year));
  if (!result.success) return res.status(400).json({ error: result.error, field: result.field });
  return res.json(result.value);
});

timeOffRulesRouter.patch('/api/time-off/holidays/:id', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageTenantSettings(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const result = await updateHoliday(user.tenantId!, req.params.id, req.body ?? {});
  if (!result.success) return res.status(400).json({ error: result.error, field: result.field });
  return res.json(result.value);
});

timeOffRulesRouter.delete('/api/time-off/holidays/:id', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageTenantSettings(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const result = await deleteHoliday(user.tenantId!, req.params.id);
  if (!result.success) return res.status(404).json({ error: result.error });
  return res.status(204).end();
});

// ---- Religious holidays per person ----
timeOffRulesRouter.get('/api/time-off/religions', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageReligions(user)) return res.status(403).json({ error: 'Insufficient permissions' });
  return res.json(await listReligionAssignments(user.tenantId!));
});

timeOffRulesRouter.get('/api/hr/employees/:employeeId/religious-holidays', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageReligions(user) && !(await isSelf(user, req.params.employeeId))) return res.status(403).json({ error: 'Insufficient permissions' });
  return res.json(await getEmployeeReligions(user.tenantId!, req.params.employeeId));
});

timeOffRulesRouter.put('/api/hr/employees/:employeeId/religious-holidays', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageReligions(user) && !(await isSelf(user, req.params.employeeId))) return res.status(403).json({ error: 'Insufficient permissions' });
  const result = await setEmployeeReligions(user.tenantId!, req.params.employeeId, req.body?.religions);
  if (!result.success) return res.status(400).json({ error: result.error, field: result.field });
  return res.json(result.value);
});

// ---- Request preview (the caller's own balance) ----
timeOffRulesRouter.post('/api/hr/time-off-requests/preview', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const employee = await findEmployeeByUserId(user.id);
  if (!employee) return res.status(400).json({ error: 'Your account is not linked to an employee record' });
  const start = parseDay(req.body?.startDate);
  const end = parseDay(req.body?.endDate);
  if (!start || !end) return res.status(400).json({ error: 'Pick both dates' });
  if (end < start) return res.status(400).json({ error: 'The end date is before the start date' });
  if (typeof req.body?.timeOffPolicyId !== 'string') return res.status(400).json({ error: 'Pick a policy' });
  const result = await previewTimeOffRequest(user.tenantId!, employee.id, req.body.timeOffPolicyId, start, end);
  if (!result.success) return res.status(400).json({ error: result.error });
  return res.json(result.preview);
});

// ---- Manual adjustments + ledger ----
timeOffRulesRouter.post('/api/hr/employees/:employeeId/time-off-adjustments', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageCustomFields(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const result = await createTimeOffAdjustment(user.tenantId!, req.params.employeeId, req.body ?? {}, user.id);
  if (!result.success) return res.status(400).json({ error: result.error, field: result.field });
  return res.status(201).json(result.value);
});

// HR, the person, or their direct manager (who already sees their balances in Team).
timeOffRulesRouter.get('/api/hr/employees/:employeeId/time-off-ledger', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const employeeId = req.params.employeeId;
  if (!canManageCustomFields(user.roleContext)) {
    const me = await findEmployeeByUserId(user.id);
    const target = await prisma.employee.findUnique({ where: { id: employeeId }, select: { tenantId: true, managerId: true } });
    const allowed = !!me && !!target && target.tenantId === user.tenantId && (me.id === employeeId || target.managerId === me.id);
    if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });
  }
  return res.json(await getTimeOffLedger(user.tenantId!, employeeId));
});

// ---- The caller's own religious holidays (Settings → Profile) ----
timeOffRulesRouter.get('/api/time-off/my-religious-holidays', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const me = await findEmployeeByUserId(user.id);
  const settings = await getTimeOffSettings(user.tenantId!);
  return res.json({ linked: !!me, enabledReligions: settings.enabledReligions, religions: me ? await getEmployeeReligions(user.tenantId!, me.id) : [] });
});

timeOffRulesRouter.put('/api/time-off/my-religious-holidays', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const me = await findEmployeeByUserId(user.id);
  if (!me) return res.status(400).json({ error: 'Your account is not linked to an employee record' });
  const result = await setEmployeeReligions(user.tenantId!, me.id, req.body?.religions);
  if (!result.success) return res.status(400).json({ error: result.error, field: result.field });
  return res.json(result.value);
});
