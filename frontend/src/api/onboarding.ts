import { API_BASE_URL, apiFetch, throwApiError } from './http.js';

export const onboardingApi = {
  seedSampleData: async (token: string): Promise<{ employees: number; companies: number }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/onboarding/seed-sample-data`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  completeTour: async (token: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/onboarding/tour-complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
