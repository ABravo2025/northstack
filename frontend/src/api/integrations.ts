import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { GoogleCalendarStatus } from './types.js';

export const integrationsApi = {
  getGoogleCalendarStatus: async (token: string): Promise<GoogleCalendarStatus> => {
    const res = await apiFetch(`${API_BASE_URL}/api/integrations/google-calendar/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // Returns the Google consent URL to navigate the browser to (see the
  // backend route's comment for why this isn't a direct redirect).
  getGoogleCalendarConnectUrl: async (token: string): Promise<{ url: string }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/integrations/google-calendar/connect`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  disconnectGoogleCalendar: async (token: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/integrations/google-calendar/disconnect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
