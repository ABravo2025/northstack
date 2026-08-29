import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { TenantMetricsOverview } from './types.js';
import type { DateRange } from '../lib/dateRangePresets.js';

export const tenantMetricsApi = {
  getTenantMetricsOverview: async (token: string, range?: DateRange): Promise<TenantMetricsOverview> => {
    const params = range ? `?since=${range.since.toISOString()}&until=${range.until.toISOString()}` : '';
    const res = await apiFetch(`${API_BASE_URL}/api/tenant-metrics/overview${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
};
