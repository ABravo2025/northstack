import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { DueDateOffset, PayFrequency, PayFrequencyCadence, PaymentMethod } from './types.js';

export const payrollApi = {
  listPayFrequencies: async (token: string): Promise<PayFrequency[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/pay-frequencies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createPayFrequency: async (
    token: string,
    data: {
      name: string;
      cadence: PayFrequencyCadence;
      anchorConfig: Record<string, unknown>;
      dueDateOffset?: DueDateOffset;
      dueDateCustomDays?: number | null;
    },
  ): Promise<PayFrequency> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/pay-frequencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updatePayFrequency: async (
    token: string,
    id: string,
    data: {
      name?: string;
      cadence?: PayFrequencyCadence;
      anchorConfig?: Record<string, unknown>;
      dueDateOffset?: DueDateOffset;
      dueDateCustomDays?: number | null;
      isActive?: boolean;
    },
  ): Promise<PayFrequency> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/pay-frequencies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  listPaymentMethods: async (token: string): Promise<PaymentMethod[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payment-methods`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createPaymentMethod: async (token: string, data: { name: string }): Promise<PaymentMethod> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payment-methods`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updatePaymentMethod: async (
    token: string,
    id: string,
    data: { name?: string; isActive?: boolean },
  ): Promise<PaymentMethod> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payment-methods/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
};
