import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { PublicFormConfig } from './types.js';

export const publicFormsPublicApi = {
  // Public forms (unauthenticated, standalone /apply page)
  getPublicFormConfig: async (tenantSlug: string, formSlug: string): Promise<PublicFormConfig> => {
    const res = await apiFetch(`${API_BASE_URL}/api/public/${tenantSlug}/${formSlug}`);
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  submitPublicForm: async (
    tenantSlug: string,
    formSlug: string,
    data: {
      firstName: string;
      lastName: string;
      email: string;
      values: Record<string, string>;
      turnstileToken: string;
      honeypot: string;
    },
  ): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/public/${tenantSlug}/${formSlug}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
  },
};
