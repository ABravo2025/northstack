import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { Contact, CustomFieldValue } from './types.js';

export const contactsApi = {
  // Contacts
  listContacts: async (token: string): Promise<Contact[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/contacts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createContact: async (
    token: string,
    data: {
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
      companyId?: string | null;
      title?: string;
      isPrimary?: boolean;
      leadStatus?: string | null;
      leadSourceId?: string | null;
    },
  ): Promise<Contact> => {
    const res = await apiFetch(`${API_BASE_URL}/api/contacts`, {
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

  updateContact: async (
    token: string,
    contactId: string,
    data: Partial<Omit<Contact, 'id' | 'createdAt' | 'company' | 'leadSource'>>,
  ): Promise<Contact> => {
    const res = await apiFetch(`${API_BASE_URL}/api/contacts/${contactId}`, {
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

  // "Delete" deactivates instead of destroying the row (docs/tareas/specredisenosalesv2.md
  // §2.2) — no destructive choice left to make, so no request body/options anymore.
  deactivateContact: async (
    token: string,
    contactId: string,
  ): Promise<{ contact: Contact; deactivatedOpportunityIds: string[] }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/contacts/${contactId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createContactCustomFieldValue: async (
    token: string,
    contactId: string,
    data: { customFieldDefinitionId: string; value: string },
  ): Promise<CustomFieldValue> => {
    const res = await apiFetch(`${API_BASE_URL}/api/contacts/${contactId}/custom-fields`, {
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

  updateContactCustomFieldValue: async (
    token: string,
    contactId: string,
    valueId: string,
    value: string,
  ): Promise<CustomFieldValue> => {
    const res = await apiFetch(`${API_BASE_URL}/api/contacts/${contactId}/custom-fields/${valueId}`, {
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

  deleteContactCustomFieldValue: async (
    token: string,
    contactId: string,
    valueId: string,
  ): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/contacts/${contactId}/custom-fields/${valueId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
