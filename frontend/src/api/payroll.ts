import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { ImportHoursResult, PayrollOverview, PayslipRow, PayslipVerification, PayslipSettingsView, PaymentMethodCatalog, OvertimePolicy, OvertimeSetup,
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
  TerminatedCompensationEntry,
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
      // Platform role for the contract-confirmation invitation (first-ever contract only).
      inviteRoleId?: string;
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

  listTerminatedCompensations: async (token: string): Promise<TerminatedCompensationEntry[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/compensation/terminated`, {
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

  getNextPayDate: async (token: string, payFrequencyId: string): Promise<{ paymentDate: string }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/pay-frequencies/${payFrequencyId}/next-pay-date`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  setRunPaymentDate: async (token: string, runId: string, paymentDate: string): Promise<PayrollRun> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/runs/${runId}/payment-date`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ paymentDate }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  voidPayrollRun: async (token: string, runId: string, reason: string): Promise<{ reissueRunId: string; payslipsVoided: number; emailed: number }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/runs/${runId}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  createSupplementRun: async (
    token: string,
    runId: string,
    lines: { employeeId: string; type: 'bonus' | 'commission' | 'reimbursement' | 'deduction'; amountCents: number; label?: string }[],
  ): Promise<{ supplementRunId: string }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/runs/${runId}/supplement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lines }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  createPayrollRun: async (token: string, data: { payFrequencyId: string; periodLabel: string; paymentDate?: string }): Promise<PayrollRun> => {
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

  // Payroll v2 (spec-payroll-v2.md).
  getPayrollOverview: async (token: string): Promise<PayrollOverview> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/overview`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  listPayslips: async (token: string, q?: string): Promise<PayslipRow[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/payslips${q ? `?q=${encodeURIComponent(q)}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  listMyPayslips: async (token: string): Promise<PayslipRow[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/payroll/me/payslips`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  getPayslipPdf: async (token: string, payslipId: string): Promise<Blob> => {
    const res = await apiFetch(`${API_BASE_URL}/api/payroll/payslips/${payslipId}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) await throwApiError(res);
    return res.blob();
  },
  resendPayslip: async (token: string, payslipId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/payslips/${payslipId}/resend`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) await throwApiError(res);
  },
  verifyPayslip: async (code: string): Promise<PayslipVerification> => {
    const res = await apiFetch(`${API_BASE_URL}/api/public/payslips/${encodeURIComponent(code)}`);
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  getPayslipSettings: async (token: string): Promise<PayslipSettingsView> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/payslip-settings`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  savePayslipSettings: async (token: string, body: { prefix: number; signerName: string | null; signature?: string | null }): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/payslip-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) await throwApiError(res);
  },
  setEmployeeTaxId: async (token: string, employeeId: string, taxId: string): Promise<{ taxIdMasked: string }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/people/${employeeId}/tax-id`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ taxId }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  getPaymentMethodCatalog: async (token: string): Promise<PaymentMethodCatalog> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payment-methods/catalog`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  setKnownPaymentMethod: async (token: string, kind: string, active: boolean): Promise<PaymentMethodCatalog> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payment-methods/known/${kind}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ active }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // Overtime and surcharges (spec-overtime.md).
  getOvertimeSetup: async (token: string): Promise<OvertimeSetup> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/overtime-policy`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  saveOvertimePolicy: async (token: string, policy: OvertimePolicy): Promise<OvertimePolicy> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/overtime-policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(policy),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  setOvertimeExempt: async (token: string, employeeId: string, exempt: boolean): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/overtime-policy/exempt`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ employeeId, exempt }),
    });
    if (!res.ok) await throwApiError(res);
  },

  // Timesheet → Payroll: approved timesheet hours of the period into a draft run.
  importPayrollHours: async (token: string, runId: string, from: string, to: string): Promise<ImportHoursResult> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/payroll/runs/${runId}/import-hours`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ from, to }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
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
