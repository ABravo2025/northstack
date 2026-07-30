import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { CatalogKind, FieldCatalogDefinition } from './types.js';

export const fieldCatalogApi = {
  // Field catalog (Department, Job Title — shared generic mechanism)
  listFieldCatalogDefinitions: async (token: string, kind: CatalogKind): Promise<FieldCatalogDefinition[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/field-catalog?kind=${kind}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createFieldCatalogDefinition: async (
    token: string,
    data: { kind: CatalogKind; name: string; order?: number },
  ): Promise<FieldCatalogDefinition> => {
    const res = await apiFetch(`${API_BASE_URL}/api/field-catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updateFieldCatalogDefinition: async (
    token: string,
    definitionId: string,
    data: { name?: string; order?: number; isActive?: boolean },
  ): Promise<FieldCatalogDefinition> => {
    const res = await apiFetch(`${API_BASE_URL}/api/field-catalog/${definitionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
};
