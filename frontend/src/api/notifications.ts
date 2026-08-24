import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { Notification } from './types.js';

export const notificationsApi = {
  listNotifications: async (token: string, page = 1): Promise<Notification[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/notifications?page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  getUnreadNotificationCount: async (token: string): Promise<number> => {
    const res = await apiFetch(`${API_BASE_URL}/api/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    const body = await res.json();
    return body.count;
  },

  markNotificationRead: async (token: string, notificationId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },

  markAllNotificationsRead: async (token: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/notifications/mark-all-read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
