import { canCreateHr } from '../modules/auth/permissionService.js';
import { getOnboardingStatus, seedSampleData } from '../modules/onboarding/onboardingService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const onboardingRouter = createAsyncRouter();

onboardingRouter.get('/api/onboarding/status', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const status = await getOnboardingStatus(user.tenantId!);
  return res.json(status);
});

onboardingRouter.post('/api/onboarding/seed-sample-data', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await seedSampleData(user.tenantId!);
  return res.status(201).json(result);
});
