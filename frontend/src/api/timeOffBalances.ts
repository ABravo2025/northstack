import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { TimeOffBalance, CustomFieldValue } from './types.js';

export const timeOffBalancesApi = {
  // Time off balances
  listTimeOffBalances: async (token: string): Promise<TimeOffBalance[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/time-off-balances`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  getEmployeeTimeOffBalance: async (token: string, employeeId: string): Promise<TimeOffBalance[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/time-off-balance`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createEmployeeCustomFieldValue: async (
    token: string,
    employeeId: string,
    data: { customFieldDefinitionId: string; value: string },
  ): Promise<CustomFieldValue> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/custom-fields`, {
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

  updateEmployeeCustomFieldValue: async (
    token: string,
    employeeId: string,
    valueId: string,
    value: string,
  ): Promise<CustomFieldValue> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/custom-fields/${valueId}`, {
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

  deleteEmployeeCustomFieldValue: async (
    token: string,
    employeeId: string,
    valueId: string,
  ): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/custom-fields/${valueId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
