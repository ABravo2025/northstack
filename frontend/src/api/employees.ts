import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { Employee, EmployeeBirthday, EmployeeCompensationSummary, Invitation } from './types.js';

export const employeesApi = {
  // HR Employees
  listEmployees: async (token: string): Promise<Employee[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createEmployee: async (
    token: string,
    data: {
      firstName: string;
      lastName: string;
      email: string;
      personalEmail?: string;
      departmentId?: string | null;
      jobTitleId?: string | null;
      managerId?: string | null;
      startDate?: string;
      endDate?: string;
      birthdate?: string;
      contractUrl?: string;
      contractType?: 'part_time' | 'full_time' | null;
      personType?: 'profile' | 'contractor' | 'employee' | null;
      nationality?: string;
    },
  ): Promise<Employee> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees`, {
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

  updateEmployee: async (
    token: string,
    employeeId: string,
    data: Partial<Employee>,
  ): Promise<Employee> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}`, {
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

  deleteEmployee: async (token: string, employeeId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },

  inviteEmployee: async (token: string, employeeId: string): Promise<{ invitation: Invitation }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/invite`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  getEmployeeCompensation: async (token: string, employeeId: string): Promise<EmployeeCompensationSummary> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/compensation`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  getEmployeeContractPdf: async (token: string, employeeId: string): Promise<Blob> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/contract-pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.blob();
  },

  resendContract: async (token: string, employeeId: string): Promise<{ success: true }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/resend-contract`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  listEmployeeBirthdays: async (token: string): Promise<EmployeeBirthday[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/birthdays`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
};
