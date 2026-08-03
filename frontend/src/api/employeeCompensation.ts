import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { BulkCompensationEntry, BulkCreateCompensationResult, CompensationStatusRow, EmployeeCompensation } from './types.js';

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

  // Unidad 5.3 — the employee's own action, confirming a pending contract.
  confirmEmployeeCompensation: async (
    token: string,
    employeeId: string,
    compensationId: string,
  ): Promise<EmployeeCompensation> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/compensation/${compensationId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // Current-user-scoped — backs the Overview banner, null when nothing's pending.
  getPendingCompensationConfirmation: async (token: string): Promise<EmployeeCompensation | null> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/compensation/pending-confirmation`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // Unidad 5.2 — backs the "Assignments" screen.
  getCompensationStatus: async (token: string): Promise<CompensationStatusRow[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/compensation/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  bulkCreateCompensation: async (
    token: string,
    data: { payFrequencyId: string; effectiveFrom: string; entries: BulkCompensationEntry[] },
  ): Promise<BulkCreateCompensationResult> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/compensation/bulk`, {
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
