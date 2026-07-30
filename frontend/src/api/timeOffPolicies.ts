import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { TimeOffPolicy } from './types.js';

export const timeOffPoliciesApi = {
  // Time off policies
  listTimeOffPolicies: async (token: string): Promise<TimeOffPolicy[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/time-off-policies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createTimeOffPolicy: async (
    token: string,
    data: {
      name: string;
      color?: string;
      accrualMethod?: 'fixed_annual' | 'monthly';
      daysPerYear: number;
      isPaid?: boolean;
      requiresApproval?: boolean;
    },
  ): Promise<TimeOffPolicy> => {
    const res = await apiFetch(`${API_BASE_URL}/api/time-off-policies`, {
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

  updateTimeOffPolicy: async (
    token: string,
    policyId: string,
    data: {
      name?: string;
      color?: string;
      accrualMethod?: 'fixed_annual' | 'monthly';
      daysPerYear?: number;
      isPaid?: boolean;
      requiresApproval?: boolean;
      isActive?: boolean;
    },
  ): Promise<TimeOffPolicy> => {
    const res = await apiFetch(`${API_BASE_URL}/api/time-off-policies/${policyId}`, {
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
};
