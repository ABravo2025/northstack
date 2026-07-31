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
};
