import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { Invitation, TenantUser, TenantInvitation } from './types.js';

export const tenantUsersApi = {
  // Company / tenant users
  listTenantUsers: async (token: string): Promise<TenantUser[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tenants/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updateTenantUser: async (
    token: string,
    userId: string,
    data: { role?: string; status?: string },
  ): Promise<{ user: TenantUser }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tenants/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  listTenantInvitations: async (token: string): Promise<TenantInvitation[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tenants/invitations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createTenantInvitation: async (
    token: string,
    data: { email: string; role: string },
  ): Promise<{ invitation: Invitation }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tenants/invitations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  cancelInvitation: async (token: string, invitationId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tenants/invitations/${invitationId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
