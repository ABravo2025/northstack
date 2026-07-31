import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { PayrollRun, PayrollRunDetail } from './types.js';

export const payrollRunsApi = {
  listPayrollRuns: async (token: string): Promise<PayrollRun[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/runs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createPayrollRun: async (token: string, data: { payFrequencyId: string; periodLabel: string }): Promise<PayrollRun> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/runs`, {
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

  getPayrollRun: async (token: string, runId: string): Promise<PayrollRunDetail> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/runs/${runId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  confirmPayrollRun: async (token: string, runId: string): Promise<PayrollRun> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/runs/${runId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  addPersonToPayrollRun: async (token: string, runId: string, employeeId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/runs/${runId}/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ employeeId }),
    });
    if (!res.ok) await throwApiError(res);
  },
};
