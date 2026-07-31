import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { PayFrequency } from './types.js';

export interface PayFrequencyInput {
  name: string;
  cadence: 'weekly' | 'biweekly' | 'monthly';
  payAnchor: string;
}

export const payFrequenciesApi = {
  listPayFrequencies: async (token: string): Promise<PayFrequency[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/pay-frequencies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createPayFrequency: async (token: string, data: PayFrequencyInput): Promise<PayFrequency> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/pay-frequencies`, {
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

  updatePayFrequency: async (
    token: string,
    frequencyId: string,
    data: Partial<PayFrequencyInput> & { isActive?: boolean },
  ): Promise<PayFrequency> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/pay-frequencies/${frequencyId}`, {
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
