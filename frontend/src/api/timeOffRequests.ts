import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { TimeOffRequest } from './types.js';

export const timeOffRequestsApi = {
  // Time off requests
  listTimeOffRequests: async (
    token: string,
    scope: 'mine' | 'pending-approval' | 'all' | 'calendar' = 'mine',
  ): Promise<TimeOffRequest[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/time-off-requests?scope=${scope}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createTimeOffRequest: async (
    token: string,
    data: { timeOffPolicyId: string; startDate: string; endDate: string; note?: string },
  ): Promise<TimeOffRequest> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/time-off-requests`, {
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

  decideTimeOffRequest: async (
    token: string,
    requestId: string,
    status: 'approved' | 'rejected',
    decisionNote?: string,
  ): Promise<TimeOffRequest> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/time-off-requests/${requestId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status, decisionNote }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  cancelTimeOffRequest: async (token: string, requestId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/time-off-requests/${requestId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
