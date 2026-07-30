import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { CustomFieldDefinition } from './types.js';

export const customFieldsApi = {
  // Custom fields
  listCustomFieldDefinitions: async (
    token: string,
    entityType: 'employee' | 'client' | 'company' | 'contact' | 'opportunity',
  ): Promise<CustomFieldDefinition[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/custom-fields?entityType=${entityType}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createCustomFieldDefinition: async (
    token: string,
    data: {
      name: string;
      entityType: 'employee' | 'client' | 'company' | 'contact' | 'opportunity';
      fieldType: string;
      options?: string;
      required?: boolean;
    },
  ): Promise<CustomFieldDefinition> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/custom-fields`, {
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

  updateCustomFieldDefinition: async (
    token: string,
    definitionId: string,
    data: { name?: string; required?: boolean; options?: string; isActive?: boolean },
  ): Promise<CustomFieldDefinition> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/custom-fields/${definitionId}`, {
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
