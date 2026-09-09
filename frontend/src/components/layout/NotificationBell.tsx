import { useEffect, useRef, useState } from 'react';
import { api, type Notification, type PlatformAnnouncement } from '../../api';
import Popover from '../common/Popover';
import { BellIcon, SparklesIcon } from '../common/Icons';
import AnnouncementDetailModal from './AnnouncementDetailModal';

interface NotificationBellProps {
  token: string;
}

// Light polling, no websockets in this first version (docs/tareas/
// specredisenosalesv2.md §3.9's own "minimal version" scope).
const POLL_INTERVAL_MS = 30_000;

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / (60 * 1000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationBell({ token }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [announcementUnreadCount, setAnnouncementUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [viewingAnnouncement, setViewingAnnouncement] = useState<PlatformAnnouncement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Bumped by every mutation (mark-one-read, mark-all-read) so a `listNotifications` response that
  // was already in flight when the mutation fired gets ignored instead of overwriting it with
  // stale (pre-mutation) data once it resolves.
  const fetchSeq = useRef(0);

  const refreshUnreadCount = () => {
    api.getUnreadNotificationCount(token).then(setUnreadCount).catch(() => {});
    api.getUnreadAnnouncementCount(token).then(setAnnouncementUnreadCount).catch(() => {});
  };

  useEffect(() => {
    refreshUnreadCount();
    const interval = setInterval(refreshUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      // Refetch on every open, not just the first — unreadCount already polls independently, so
      // without this the badge count and the dropdown list can silently disagree until a full
      // page reload once new notifications arrive between opens.
      const seq = ++fetchSeq.current;
      api
        .listNotifications(token)
        .then((data) => {
          if (seq !== fetchSeq.current) return;
          setNotifications(data);
          setLoaded(true);
        })
        .catch(() => {});
      api
        .listAnnouncements(token)
        .then((data) => {
          if (seq !== fetchSeq.current) return;
          setAnnouncements(data);
        })
        .catch(() => {});
      // Announcements use a single per-user cursor (not a per-row `read` flag like
      // Notification), so opening the list is itself the "seen" action — same behavior the
      // old standalone changelog icon had via localStorage, just server-side now.
      if (announcementUnreadCount > 0) {
        api.markAnnouncementsSeen(token).then(() => setAnnouncementUnreadCount(0)).catch(() => {});
      }
    }
  };

  const handleItemClick = async (notification: Notification) => {
    if (notification.read) return;
    try {
      await api.markNotificationRead(token, notification.id);
      fetchSeq.current++;
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Non-critical — leave it unread rather than surface a toast for this.
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead(token);
      fetchSeq.current++;
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Non-critical, same as above.
    }
  };

  const totalUnread = unreadCount + announcementUnreadCount;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="changelog-trigger"
        onClick={handleOpen}
        aria-label={totalUnread > 0 ? `Notifications (${totalUnread} unread)` : 'Notifications'}
        title="Notifications"
      >
        <BellIcon className="h-4.5 w-4.5" />
        {totalUnread > 0 && <span className="notification-badge">{totalUnread > 99 ? '99+' : totalUnread}</span>}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} align="right" width={320}>
        <div className="flex items-center justify-between">
          <div className="color-picker-section-label">Notifications</div>
          {unreadCount > 0 && (
            <button type="button" className="table-link text-xs" onClick={handleMarkAllRead}>
              Mark all read
            </button>
          )}
        </div>
        <div className="notification-list mt-2">
          {loaded && notifications.length === 0 && <p className="notification-empty">No notifications yet.</p>}
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`notification-item ${n.read ? '' : 'unread'}`}
              onClick={() => handleItemClick(n)}
            >
              <span>{n.message}</span>
              <span className="notification-item-time">{formatRelativeTime(n.createdAt)}</span>
            </button>
          ))}
        </div>
        {announcements.length > 0 && (
          <>
            <div className="color-picker-section-label mt-3 flex items-center gap-1">
              <SparklesIcon className="h-3.5 w-3.5" />
              What's new
            </div>
            <div className="notification-list mt-2">
              {announcements.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`notification-item ${a.isUnread ? 'unread' : ''}`}
                  onClick={() => {
                    setOpen(false);
                    setViewingAnnouncement(a);
                  }}
                >
                  <span>{a.title}</span>
                  <span className="notification-item-time">{formatRelativeTime(a.publishedAt)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </Popover>
      {viewingAnnouncement && (
        <AnnouncementDetailModal announcement={viewingAnnouncement} onClose={() => setViewingAnnouncement(null)} />
      )}
    </>
  );
}
