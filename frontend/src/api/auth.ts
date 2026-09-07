import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { AuthResponse, PermissionsPayload, PlanTier, Tenant, TenantUser } from './types.js';

// Tenant Signup — email verification (spec-tenant-signup.md). /start and /resend hit distinct
// backend routes (own rate-limit buckets for the cooldown timer/analytics) but are otherwise
// identical requests — one helper instead of two copies that could diverge.
const postSignupEmail = async (path: 'start' | 'resend', email: string): Promise<{ message: string }> => {
  const res = await apiFetch(`${API_BASE_URL}/api/tenants/signup/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
};

export const authApi = {
  startSignup: (email: string) => postSignupEmail('start', email),
  resendSignup: (email: string) => postSignupEmail('resend', email),

  verifySignup: async (token: string): Promise<{ email: string }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tenants/signup/verify/${token}`);
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // Auth
  registerTenant: async (data: {
    tenantName: string;
    ownerFirstName: string;
    ownerLastName: string;
    ownerEmail: string;
    ownerPassword: string;
    ownerPhone: string;
    acceptedTerms: boolean;
    companySize: string;
    industry: string;
    country: string;
    acquisitionChannel?: string;
    jobFunction?: string;
    verificationToken: string;
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

  getCurrentUser: async (token: string): Promise<{ user: any; permissions: PermissionsPayload }> => {
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

  getCurrentTenant: async (token: string): Promise<Tenant> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tenants/current`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    const data = await res.json();
    return data.tenant;
  },
  updateTenantCurrency: async (token: string, currency: string): Promise<Tenant> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tenants/current`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currency }),
    });
    if (!res.ok) await throwApiError(res);
    const data = await res.json();
    return data.tenant;
  },

  // Subscription Plans (spec-subscription-plans.md). Public — mirrors planService.ts's
  // CURRENT_PLAN_PRICES_CENTS so PlansModal doesn't carry a second, driftable copy of the price.
  getPlanPrices: async (): Promise<{ prices: Record<'starter' | 'growth', number> }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/plans/prices`);
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updateTenantPlan: async (token: string, plan: PlanTier): Promise<Tenant> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tenants/me/plan`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plan }),
    });
    if (!res.ok) await throwApiError(res);
    const data = await res.json();
    return data.tenant;
  },
};
