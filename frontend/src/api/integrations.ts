import { API_BASE_URL, apiFetch, throwApiError } from './http.js';

// OAuth endpoints answer { error, error_description } (RFC 6749), not the app's { error } shape.
async function throwOAuthError(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({}));
  throw new Error(body.error_description || body.error || `Request failed (${res.status})`);
}
import type { AiConnectionSummary, ApiKeySummary, CreateApiKeyResult, GoogleCalendarStatus, GoogleCalendarViewEvent, StripeConnectionStatus } from './types.js';

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

  listApiKeys: async (token: string): Promise<ApiKeySummary[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/integrations/api-keys`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // Scopes the signed-in user's role may put on a key (backend apiScopePermissions.ts).
  listGrantableApiScopes: async (token: string): Promise<string[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/integrations/api-keys/grantable-scopes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // Returns the full key in `fullKey` — the only time it's ever visible after this.
  createApiKey: async (token: string, input: { name: string; scopes: string[] }): Promise<CreateApiKeyResult> => {
    const res = await apiFetch(`${API_BASE_URL}/api/integrations/api-keys`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  revokeApiKey: async (token: string, id: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/integrations/api-keys/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },

  // 'all' = every connection in the workspace (needs manage_api_access); 'mine' = the caller's own.
  listAiConnections: async (token: string, scope: 'mine' | 'all' = 'mine'): Promise<AiConnectionSummary[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/integrations/ai-connections${scope === 'all' ? '?scope=all' : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // OAuth consent page (spec-mcp-server.md §4.1): what to show for this authorize request…
  getOAuthConsentContext: async (token: string, query: string): Promise<{ clientName: string; redirectHost: string; blocked: 'plan' | 'permission' | null }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/oauth/authorize/context?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwOAuthError(res);
    return res.json();
  },

  // …and the person's decision; the response says where to send the browser back to the assistant.
  decideOAuthConsent: async (token: string, body: Record<string, string>): Promise<{ redirectTo: string }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/oauth/authorize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) await throwOAuthError(res);
    return res.json();
  },

  revokeAiConnection: async (token: string, id: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/integrations/ai-connections/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
