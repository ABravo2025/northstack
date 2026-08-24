import {
  countUnreadNotifications,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from '../modules/notifications/notificationService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const notificationsRouter = createAsyncRouter();

// Open to any authenticated tenant member — a notification is scoped to its
// recipient (userId), not gated by role, same reasoning as tasks.ts's "My
// tasks" (this data is inherently already private to the requester).

notificationsRouter.get('/api/notifications', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
  const notifications = await listNotificationsForUser(user.tenantId!, user.id, page);
  return res.json(notifications);
});

notificationsRouter.get('/api/notifications/unread-count', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const count = await countUnreadNotifications(user.tenantId!, user.id);
  return res.json({ count });
});

notificationsRouter.patch('/api/notifications/:notificationId/read', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const result = await markNotificationRead(req.params.notificationId, user.tenantId!, user.id);
  if (!result.success) {
    return res.status(404).json({ error: result.error });
  }
  return res.json({ success: true });
});

notificationsRouter.post('/api/notifications/mark-all-read', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  await markAllNotificationsRead(user.tenantId!, user.id);
  return res.json({ success: true });
});
