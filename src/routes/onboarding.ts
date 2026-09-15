import { canCreateHr } from '../modules/auth/permissionService.js';
import { seedSampleData, completeTour } from '../modules/onboarding/onboardingService.js';
import { authenticateUser, validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const onboardingRouter = createAsyncRouter();

onboardingRouter.post('/api/onboarding/seed-sample-data', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await seedSampleData(user.tenantId!, user.id);
  return res.status(201).json(result);
});

// No permission gate beyond being logged in — marking the tour seen is a per-user preference, not
// a tenant-scoped mutation, so it deliberately uses authenticateUser (not validateSession) to stay
// reachable even for a suspended tenant's view-only users instead of 403ing and leaving the tour
// re-launching on every visit until they pay.
onboardingRouter.post('/api/onboarding/tour-complete', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) {
    return;
  }

  await completeTour(user.id);
  return res.status(204).send();
});
