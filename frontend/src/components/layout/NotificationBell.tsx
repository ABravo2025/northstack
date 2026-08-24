import { useEffect, useRef, useState } from 'react';
import { api, type Notification } from '../../api';
import Popover from '../common/Popover';
import { BellIcon } from '../common/Icons';

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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const refreshUnreadCount = () => {
    api.getUnreadNotificationCount(token).then(setUnreadCount).catch(() => {});
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
    if (next && !loaded) {
      api
        .listNotifications(token)
        .then((data) => {
          setNotifications(data);
          setLoaded(true);
        })
        .catch(() => {});
    }
  };

  const handleItemClick = async (notification: Notification) => {
    if (notification.read) return;
    try {
      await api.markNotificationRead(token, notification.id);
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Non-critical — leave it unread rather than surface a toast for this.
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead(token);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Non-critical, same as above.
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="changelog-trigger"
        onClick={handleOpen}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        title="Notifications"
      >
        <BellIcon className="h-4.5 w-4.5" />
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
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
      </Popover>
    </>
  );
}
