import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { Company, CustomFieldValue } from './types.js';

export const companiesApi = {
  // Companies
  listCompanies: async (token: string): Promise<Company[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/companies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createCompany: async (
    token: string,
    data: {
      name: string;
      industry?: string;
      website?: string;
      phone?: string;
      billingAddress?: string;
      sizeId?: string;
      accountOwnerId?: string | null;
      contact: { firstName: string; lastName: string; email: string } | { contactId: string };
      isPlaceholder?: boolean;
    },
  ): Promise<Company> => {
    const res = await apiFetch(`${API_BASE_URL}/api/companies`, {
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

  updateCompany: async (
    token: string,
    companyId: string,
    data: Partial<Omit<Company, 'id' | 'statusId' | 'statusDefn' | 'createdAt'>>,
  ): Promise<Company> => {
    const res = await apiFetch(`${API_BASE_URL}/api/companies/${companyId}`, {
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

  deleteCompany: async (
    token: string,
    companyId: string,
    options?: { deleteLinkedOpportunities?: boolean; cascadeToChildCompanies?: boolean },
  ): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/companies/${companyId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(options ?? {}),
    });
    if (!res.ok) await throwApiError(res);
  },

  createCompanyCustomFieldValue: async (
    token: string,
    companyId: string,
    data: { customFieldDefinitionId: string; value: string },
  ): Promise<CustomFieldValue> => {
    const res = await apiFetch(`${API_BASE_URL}/api/companies/${companyId}/custom-fields`, {
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

  updateCompanyCustomFieldValue: async (
    token: string,
    companyId: string,
    valueId: string,
    value: string,
  ): Promise<CustomFieldValue> => {
    const res = await apiFetch(`${API_BASE_URL}/api/companies/${companyId}/custom-fields/${valueId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ value }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  deleteCompanyCustomFieldValue: async (
    token: string,
    companyId: string,
    valueId: string,
  ): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/companies/${companyId}/custom-fields/${valueId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
