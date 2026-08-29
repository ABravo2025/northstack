import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { TenantMetricsOverview } from './types.js';

export const tenantMetricsApi = {
  getTenantMetricsOverview: async (token: string, monthsBack = 6): Promise<TenantMetricsOverview> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tenant-metrics/overview?months=${monthsBack}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
};
