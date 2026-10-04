import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { requestDeletionByOwner } from '../modules/platform/tenantDeletionService.js';

// Admin Center v2, stage 5 (2026-10-04): the owner deletes the company account from the app.
// Blocks access at once; the data is erased 10 days later (tenantDeletionService.ts).
export const accountDeletionRouter = createAsyncRouter();

accountDeletionRouter.post('/api/tenants/me/delete-account', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  const result = await requestDeletionByOwner(user, { confirmName: req.body?.confirmName, password: req.body?.password });
  if (!result.success) {
    return res.status(result.field === 'password' ? 401 : 400).json({ error: result.error, field: result.field });
  }
  return res.json({ success: true, deleteOn: result.deleteOn });
});
