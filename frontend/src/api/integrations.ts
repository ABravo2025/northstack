import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { GoogleCalendarStatus, GoogleCalendarViewEvent, StripeConnectionStatus } from './types.js';

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

  // Read-only overlay for the Overview calendar — the caller's own Google
  // events that aren't already synced Tasks, scoped to [start, end).
  listGoogleCalendarEvents: async (token: string, start: string, end: string): Promise<GoogleCalendarViewEvent[]> => {
    const params = new URLSearchParams({ start, end });
    const res = await apiFetch(`${API_BASE_URL}/api/integrations/google-calendar/events?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  getStripeStatus: async (token: string): Promise<StripeConnectionStatus> => {
    const res = await apiFetch(`${API_BASE_URL}/api/integrations/stripe/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  connectStripe: async (token: string, apiKey: string): Promise<StripeConnectionStatus> => {
    const res = await apiFetch(`${API_BASE_URL}/api/integrations/stripe/connect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  disconnectStripe: async (token: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/integrations/stripe`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
