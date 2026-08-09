import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { AuthResponse, TenantUser } from './types.js';

export const authApi = {
  // Auth
  registerTenant: async (data: {
    tenantName: string;
    ownerFirstName: string;
    ownerLastName: string;
    ownerEmail: string;
    ownerPassword: string;
    ownerPhone: string;
    acceptedTerms: boolean;
    companySize?: string;
    industry?: string;
    country?: string;
    acquisitionChannel?: string;
  }): Promise<AuthResponse> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tenants/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  login: async (data: {
    email: string;
    password: string;
  }): Promise<AuthResponse> => {
    const res = await apiFetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  register: async (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone: string;
    acceptedTerms: boolean;
  }): Promise<AuthResponse> => {
    const res = await apiFetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  getInvitation: async (
    invitationToken: string,
  ): Promise<{ email: string; role: string; status: string; expiresAt: string }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/invitations/${invitationToken}`);
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  acceptInvitation: async (token: string, invitationToken: string): Promise<AuthResponse> => {
    const res = await apiFetch(`${API_BASE_URL}/api/invitations/${invitationToken}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  forgotPassword: async (email: string): Promise<{ message: string }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  validateResetToken: async (token: string): Promise<{ valid: boolean }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/auth/reset-password/${token}`);
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  resetPassword: async (token: string, password: string): Promise<AuthResponse> => {
    const res = await apiFetch(`${API_BASE_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  logout: async (token: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },

  getCurrentUser: async (token: string) => {
    const res = await apiFetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updateProfile: async (
    token: string,
    data: { firstName: string; lastName: string; phone: string },
  ): Promise<{ user: TenantUser }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/users/me`, {
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

  changePassword: async (
    token: string,
    data: { currentPassword: string; newPassword: string },
  ): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/users/me/password`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
  },

  getCurrentTenant: async (token: string): Promise<{ id: string; name: string; currency: string }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tenants/current`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    const data = await res.json();
    return data.tenant;
  },
  updateTenantCurrency: async (token: string, currency: string): Promise<{ id: string; name: string; currency: string }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tenants/current`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currency }),
    });
    if (!res.ok) await throwApiError(res);
    const data = await res.json();
    return data.tenant;
  },
};
