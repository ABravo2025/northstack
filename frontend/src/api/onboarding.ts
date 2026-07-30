import { API_BASE_URL, apiFetch, throwApiError } from './http.js';

export const onboardingApi = {
  // Onboarding
  getOnboardingStatus: async (
    token: string,
  ): Promise<{ hasEmployees: boolean; hasClients: boolean; hasInvitedTeammate: boolean; hasTimeOffPolicy: boolean }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/onboarding/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  seedSampleData: async (token: string): Promise<{ employees: number; clients: number }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/onboarding/seed-sample-data`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
};
