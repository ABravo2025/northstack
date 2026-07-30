import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { StatusDefinition } from './types.js';

export const statusesApi = {
  // Status definitions
  listStatusDefinitions: async (
    token: string,
    entityType: 'employee' | 'client' | 'company',
  ): Promise<StatusDefinition[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/status-definitions?entityType=${entityType}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createStatusDefinition: async (
    token: string,
    data: { entityType: 'employee' | 'client' | 'company'; name: string; color?: string; order?: number; isDefault?: boolean },
  ): Promise<StatusDefinition> => {
    const res = await apiFetch(`${API_BASE_URL}/api/status-definitions`, {
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

  updateStatusDefinition: async (
    token: string,
    definitionId: string,
    data: { name?: string; color?: string; order?: number; isDefault?: boolean; isActive?: boolean },
  ): Promise<StatusDefinition> => {
    const res = await apiFetch(`${API_BASE_URL}/api/status-definitions/${definitionId}`, {
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
