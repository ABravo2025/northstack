import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { canManageShifts } from '../modules/auth/permissionService.js';
import { getPlanLimits } from '../modules/tenant/planLimits.js';
import { viewableLocationIds } from '../modules/shifts/shiftAccess.js';
import { getShiftsSettings, updateShiftsSettings } from '../modules/shifts/shiftsSettingsService.js';
import {
  createLocation,
  deleteLocation,
  findLocationById,
  listLocations,
  updateLocation,
} from '../modules/shifts/locationService.js';

// Shifts module (docs/general/spec-shifts.md). Access: view_shifts / manage_shifts cover every
// location; a location's manager schedules that location; everyone sees and answers their own
// shifts (shiftAccess.ts). Module setup (settings, locations) is manage_shifts only.

export const shiftsRouter = createAsyncRouter();

function planLimitError(limit: number) {
  return {
    error: `Your plan allows ${limit} active location${limit === 1 ? '' : 's'}. Deactivate one, or upgrade to Growth for unlimited locations.`,
    code: 'plan_limit_locations',
    limit,
  };
}

// ---- Settings ----
// Readable by anyone in the tenant: the schedule and "My shifts" screens need weekStartsOn and
// whether confirmation is required.
shiftsRouter.get('/api/shifts/settings', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  return res.json(await getShiftsSettings(user.tenantId!));
});

shiftsRouter.patch('/api/shifts/settings', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageShifts(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const result = await updateShiftsSettings(user.tenantId!, req.body ?? {}, user.id);
  if (!result.success) return res.status(400).json({ error: result.error, field: result.field });
  return res.json(result.value);
});

// ---- Locations ----
// Who sees what: whole-schedule roles get every location; a location manager gets the ones they
// manage; anyone else gets an empty list (their own shifts carry their location's name).
// ?includeInactive=true is for the Settings screen and only honoured for manage_shifts.
shiftsRouter.get('/api/shifts/locations', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const ids = await viewableLocationIds(user);
  const includeInactive = req.query.includeInactive === 'true' && canManageShifts(user.roleContext);
  const locations = await listLocations(user.tenantId!, { includeInactive, ids });
  return res.json({ locations, maxActiveLocations: getPlanLimits(user.tenant).maxActiveLocations });
});

shiftsRouter.post('/api/shifts/locations', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageShifts(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const result = await createLocation(user.tenantId!, req.body ?? {}, user.id, getPlanLimits(user.tenant).maxActiveLocations);
  if (!result.success) {
    if (result.error === 'plan_limit' && 'limit' in result) return res.status(403).json(planLimitError(result.limit));
    return res.status(400).json({ error: result.error, field: 'field' in result ? result.field : undefined });
  }
  return res.status(201).json(result.value);
});

shiftsRouter.patch('/api/shifts/locations/:locationId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageShifts(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const existing = await findLocationById(String(req.params.locationId));
  if (!existing || existing.tenantId !== user.tenantId) return res.status(404).json({ error: 'Location not found' });
  const result = await updateLocation(existing, req.body ?? {}, user.id, getPlanLimits(user.tenant).maxActiveLocations);
  if (!result.success) {
    if (result.error === 'plan_limit' && 'limit' in result) return res.status(403).json(planLimitError(result.limit));
    return res.status(400).json({ error: result.error, field: 'field' in result ? result.field : undefined });
  }
  return res.json(result.value);
});

shiftsRouter.delete('/api/shifts/locations/:locationId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageShifts(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const existing = await findLocationById(String(req.params.locationId));
  if (!existing || existing.tenantId !== user.tenantId) return res.status(404).json({ error: 'Location not found' });
  const result = await deleteLocation(existing, user.id);
  if (!result.success) return res.status(409).json({ error: result.error });
  return res.status(204).end();
});
