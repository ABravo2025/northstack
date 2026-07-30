import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { PublicFormFieldConfig, Form } from './types.js';

export const publicFormsAdminApi = {
  // Public forms (admin management)
  listPublicForms: async (token: string): Promise<{ tenantSlug: string | null; forms: Form[] }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/public-forms`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createPublicForm: async (
    token: string,
    data: {
      name: string;
      slug: string;
      entityType: 'employee' | 'client' | 'contact';
      fields: PublicFormFieldConfig[];
      thankYouMessage?: string;
      accessMode?: 'public' | 'internal';
      pipelineId?: string | null;
    },
  ): Promise<Form> => {
    const res = await apiFetch(`${API_BASE_URL}/api/public-forms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updatePublicForm: async (
    token: string,
    formId: string,
    data: {
      name?: string;
      fields?: PublicFormFieldConfig[];
      isActive?: boolean;
      thankYouMessage?: string;
      pipelineId?: string | null;
    },
  ): Promise<Form> => {
    const res = await apiFetch(`${API_BASE_URL}/api/public-forms/${formId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
};
