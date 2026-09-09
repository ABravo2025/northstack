import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { PlatformAnnouncement } from './types.js';

export const announcementsApi = {
  listAnnouncements: async (token: string): Promise<PlatformAnnouncement[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/announcements`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  getUnreadAnnouncementCount: async (token: string): Promise<number> => {
    const res = await apiFetch(`${API_BASE_URL}/api/announcements/unread-count`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    const body = await res.json();
    return body.count;
  },

  markAnnouncementsSeen: async (token: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/announcements/mark-seen`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
