import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { EmployeeTimeOffPolicyAssignment } from './types.js';

export const timeOffPolicyAssignmentsApi = {
  // Time off policy assignments (per employee)
  listEmployeeTimeOffPolicies: async (token: string, employeeId: string): Promise<EmployeeTimeOffPolicyAssignment[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/time-off-policies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  assignTimeOffPolicyToEmployee: async (
    token: string,
    employeeId: string,
    timeOffPolicyId: string,
  ): Promise<EmployeeTimeOffPolicyAssignment> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/time-off-policies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ timeOffPolicyId }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  unassignTimeOffPolicyFromEmployee: async (token: string, employeeId: string, timeOffPolicyId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/time-off-policies/${timeOffPolicyId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
