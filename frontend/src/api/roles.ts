import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { Role } from './types.js';

export const rolesApi = {
  listRoles: async (token: string): Promise<Role[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/roles`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  setRolePermission: async (
    token: string,
    roleId: string,
    permission: string,
    granted: boolean,
  ): Promise<{ permissions: string[] }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/roles/${roleId}/permissions`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ permission, granted }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createRole: async (token: string, name: string, duplicateFromRoleId?: string): Promise<Role> => {
    const res = await apiFetch(`${API_BASE_URL}/api/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, duplicateFromRoleId }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  renameRole: async (token: string, roleId: string, name: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/roles/${roleId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) await throwApiError(res);
  },

  deleteRole: async (token: string, roleId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/roles/${roleId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
