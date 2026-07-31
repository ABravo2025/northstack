import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { EmployeeCompensation } from './types.js';

export interface EmployeeCompensationInput {
  compensationType: 'hourly' | 'fixed';
  rateCents: number;
  currency: string;
  payFrequencyId: string;
  effectiveFrom: string;
  note?: string;
}

export const employeeCompensationApi = {
  listEmployeeCompensation: async (token: string, employeeId: string): Promise<EmployeeCompensation[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/compensation`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createEmployeeCompensation: async (
    token: string,
    employeeId: string,
    data: EmployeeCompensationInput,
  ): Promise<EmployeeCompensation> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/compensation`, {
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
};
