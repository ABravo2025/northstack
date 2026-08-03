import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { AnchorConfig, PayFrequency } from './types.js';

export interface PayFrequencyInput {
  name: string;
  cadence: 'weekly' | 'semimonthly' | 'monthly';
  anchorConfig: AnchorConfig;
  dueDateOffset: 'same_day' | 'plus_2' | 'plus_5' | 'custom';
  dueDateCustomDays?: number;
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
      body: JSON.stringify({ ...data, anchorConfig: JSON.stringify(data.anchorConfig) }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updatePayFrequency: async (
    token: string,
    frequencyId: string,
    data: Partial<Omit<PayFrequencyInput, 'anchorConfig'>> & { anchorConfig?: AnchorConfig; isActive?: boolean },
  ): Promise<PayFrequency> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/pay-frequencies/${frequencyId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...data,
        anchorConfig: data.anchorConfig !== undefined ? JSON.stringify(data.anchorConfig) : undefined,
      }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
};
