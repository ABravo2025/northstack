import {
  countUnreadAnnouncements,
  listAnnouncementsForUser,
  markAnnouncementsSeen,
} from '../modules/notifications/platformAnnouncementService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const announcementsRouter = createAsyncRouter();

// Platform-wide, not tenant-scoped — same reasoning as PlatformAnnouncement itself (see
// schema.prisma). Open to any authenticated user regardless of role, same as notifications.ts.

announcementsRouter.get('/api/announcements', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const announcements = await listAnnouncementsForUser(user.id);
  return res.json(announcements);
});

announcementsRouter.get('/api/announcements/unread-count', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const count = await countUnreadAnnouncements(user.id);
  return res.json({ count });
});

announcementsRouter.post('/api/announcements/mark-seen', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  await markAnnouncementsSeen(user.id);
  return res.json({ success: true });
});
