import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { PayrollEntry } from './types.js';

export interface PayrollEntryInput {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
  paymentDate: string;
}

export const payrollApi = {
  listPayrollEntries: async (token: string): Promise<PayrollEntry[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll-entries`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createPayrollEntry: async (token: string, data: PayrollEntryInput): Promise<PayrollEntry> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll-entries`, {
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

  updatePayrollEntry: async (token: string, entryId: string, data: Partial<PayrollEntryInput>): Promise<PayrollEntry> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll-entries/${entryId}`, {
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

  deletePayrollEntry: async (token: string, entryId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll-entries/${entryId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
