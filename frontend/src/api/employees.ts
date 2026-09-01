import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type {
  Employee,
  EmployeeBirthday,
  EmployeeCompensationSummary,
  EmployeeDirectoryEntry,
  EmployeePaymentHistoryEntry,
  EmployeeTermination,
  EmployeeTerminationOptions,
  Invitation,
  PayrollEntryType,
} from './types.js';

export const employeesApi = {
  // HR Employees
  listEmployees: async (token: string): Promise<Employee[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // Custom Roles Fase E — unscoped, PII-free roster for pickers (manager selection, Task "who is
  // this for", termination reassignment). See EmployeeDirectoryEntry's doc comment.
  listEmployeeDirectory: async (token: string): Promise<EmployeeDirectoryEntry[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/directory`, {
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

  getEmployeePaymentHistory: async (token: string, employeeId: string): Promise<EmployeePaymentHistoryEntry[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/payment-history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  getTerminationOptions: async (token: string, employeeId: string): Promise<EmployeeTerminationOptions> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/termination`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createTermination: async (
    token: string,
    employeeId: string,
    data: {
      terminationDate: string;
      revokeAccess: boolean;
      reassignments?: { reportEmployeeId: string; newManagerId: string | null }[];
      finalPayment?: {
        amountCents: number;
        currency: string;
        paymentDate: string;
        label?: string | null;
        additionalLines?: { type: Exclude<PayrollEntryType, 'base'>; amountCents: number; label?: string | null }[];
      };
    },
  ): Promise<{ termination: EmployeeTermination; executedNow: boolean }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/termination`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  cancelTermination: async (token: string, terminationId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employee-terminations/${terminationId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
