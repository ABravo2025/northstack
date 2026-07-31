import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { PayrollEntry } from './types.js';

export interface PayrollAdjustmentInput {
  runId: string;
  employeeId: string;
  type: 'bonus' | 'commission' | 'reimbursement' | 'deduction';
  amountCents: number;
  currency: string;
  label?: string;
}

export const payrollEntriesApi = {
  createPayrollAdjustment: async (token: string, data: PayrollAdjustmentInput): Promise<PayrollEntry> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/entries`, {
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

  deletePayrollAdjustment: async (token: string, entryId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/entries/${entryId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },

  updatePayrollEntryHours: async (token: string, entryId: string, hoursQty: number): Promise<PayrollEntry> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/entries/${entryId}/hours`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ hoursQty }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createOffCyclePayments: async (
    token: string,
    data: {
      type: 'bonus' | 'commission' | 'reimbursement' | 'deduction';
      currency: string;
      paymentDate: string;
      payments: { employeeId: string; amountCents: number }[];
    },
  ): Promise<PayrollEntry[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/off-payments`, {
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
