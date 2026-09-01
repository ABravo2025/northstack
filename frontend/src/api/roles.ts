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
};
