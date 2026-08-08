import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type {
  BulkCompensationEntryResult,
  CompensationStatusEntry,
  DueDateOffset,
  EmployeeCompensation,
  OffCyclePayrollEntry,
  PayFrequency,
  PayFrequencyCadence,
  PaymentMethod,
  PayrollCompensationType,
  PayrollEntryType,
  PayrollRun,
  PayrollRunEntry,
  RunDetail,
} from './types.js';

export const payrollApi = {
  listPayFrequencies: async (token: string): Promise<PayFrequency[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/pay-frequencies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createPayFrequency: async (
    token: string,
    data: {
      name: string;
      cadence: PayFrequencyCadence;
      anchorConfig: Record<string, unknown>;
      dueDateOffset?: DueDateOffset;
      dueDateCustomDays?: number | null;
    },
  ): Promise<PayFrequency> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/pay-frequencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updatePayFrequency: async (
    token: string,
    id: string,
    data: {
      name?: string;
      cadence?: PayFrequencyCadence;
      anchorConfig?: Record<string, unknown>;
      dueDateOffset?: DueDateOffset;
      dueDateCustomDays?: number | null;
      isActive?: boolean;
    },
  ): Promise<PayFrequency> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/pay-frequencies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  listPaymentMethods: async (token: string): Promise<PaymentMethod[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payment-methods`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createPaymentMethod: async (token: string, data: { name: string }): Promise<PaymentMethod> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payment-methods`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updatePaymentMethod: async (
    token: string,
    id: string,
    data: { name?: string; isActive?: boolean },
  ): Promise<PaymentMethod> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payment-methods/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createCompensation: async (
    token: string,
    data: {
      employeeId: string;
      compensationType: PayrollCompensationType;
      rateCents: number;
      currency: string;
      payFrequencyId: string;
      jobTitle: string;
      description: string;
      effectiveFrom: string;
      note?: string;
    },
  ): Promise<EmployeeCompensation> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/compensation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  getCompensationStatus: async (token: string): Promise<CompensationStatusEntry[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/compensation/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createCompensationBulk: async (
    token: string,
    data: {
      payFrequencyId: string;
      effectiveFrom: string;
      entries: {
        employeeId: string;
        compensationType: PayrollCompensationType;
        rateCents: number;
        currency: string;
        jobTitle: string;
        description: string;
      }[];
    },
  ): Promise<BulkCompensationEntryResult[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/compensation/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // --- Payroll Runs (Unidad 12/13/16/17) -----------------------------------

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
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  getPayrollRunDetail: async (token: string, runId: string): Promise<RunDetail> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/runs/${runId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  addEmployeeToPayrollRun: async (token: string, runId: string, employeeId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/runs/${runId}/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ employeeId }),
    });
    if (!res.ok) await throwApiError(res);
  },

  confirmPayrollRun: async (token: string, runId: string): Promise<PayrollRun> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/runs/${runId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // --- Payroll entries: adjustments (Unidad 14) + hours (Unidad 15) -------

  createPayrollAdjustment: async (
    token: string,
    data: {
      runId: string;
      employeeId: string;
      type: PayrollEntryType;
      amountCents: number;
      currency: string;
      label?: string;
      paymentDate: string;
    },
  ): Promise<PayrollRunEntry> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  deletePayrollEntry: async (token: string, entryId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/entries/${entryId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },

  updatePayrollEntryHours: async (token: string, entryId: string, hoursQty: number): Promise<PayrollRunEntry> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/entries/${entryId}/hours`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ hoursQty }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // --- Off-cycle payments (Unidad 18) --------------------------------------

  listOffCyclePayments: async (token: string): Promise<OffCyclePayrollEntry[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/off-payments`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createOffCyclePayments: async (
    token: string,
    data: {
      type: PayrollEntryType;
      paymentDate: string;
      entries: { employeeId: string; amountCents: number; currency: string; label?: string }[];
    },
  ): Promise<{ employeeId: string; entryId: string }[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/off-payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // --- Payslip preview PDF (Unidad 20) -------------------------------------

  getRunEmployeePayslip: async (token: string, runId: string, employeeId: string): Promise<Blob> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/runs/${runId}/employees/${employeeId}/payslip`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.blob();
  },

  getEntryPayslip: async (token: string, entryId: string): Promise<Blob> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/entries/${entryId}/payslip`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.blob();
  },
};
