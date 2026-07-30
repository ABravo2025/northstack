import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { ViewFilter, ViewSort, SavedView } from './types.js';

export const savedViewsApi = {
  // Saved views
  listViews: async (token: string, entityType: 'employee' | 'client' | 'company' | 'contact'): Promise<SavedView[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/views?entityType=${entityType}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createView: async (
    token: string,
    data: {
      entityType: 'employee' | 'client' | 'company' | 'contact';
      name: string;
      type: 'grid' | 'kanban' | 'list';
      visibility: 'personal' | 'shared';
      filters?: ViewFilter[];
      sortBy?: ViewSort | null;
      groupByField?: string | null;
    },
  ): Promise<SavedView> => {
    const res = await apiFetch(`${API_BASE_URL}/api/views`, {
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

  updateView: async (
    token: string,
    viewId: string,
    data: { name?: string; filters?: ViewFilter[]; sortBy?: ViewSort | null; groupByField?: string | null },
  ): Promise<SavedView> => {
    const res = await apiFetch(`${API_BASE_URL}/api/views/${viewId}`, {
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

  deleteView: async (token: string, viewId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/views/${viewId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
