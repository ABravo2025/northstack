import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { AuthResponse, PayrollCompensationType } from './types.js';

export interface ContractConfirmationDetails {
  tenantName: string;
  employeeFirstName: string;
  employeeLastName: string;
  email: string;
  jobTitle: string;
  description: string;
  compensationType: PayrollCompensationType;
  rateCents: number;
  currency: string;
  payFrequencyName: string;
  effectiveFrom: string;
  nationality: string | null;
  timeOffPolicyNames: string[];
  // Payroll v2: `asks` = which account detail to ask for (cbu, cvu, iban_ach, email, none, text).
  paymentMethods: { id: string; name: string; kind?: string; asks?: string }[];
  // Payroll v2: the person's tax ID (CUIL / SSN / other) when nobody filled it in yet.
  taxId?: { kind: 'cuit' | 'cuil' | 'ein' | 'ssn' | 'other'; required: boolean } | null;
}

export const contractConfirmationPublicApi = {
  // Public, unauthenticated (standalone /confirm-contract/:token page)
  getContractConfirmation: async (token: string): Promise<ContractConfirmationDetails> => {
    const res = await apiFetch(`${API_BASE_URL}/api/public/contract-confirmation/${token}`);
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  confirmContract: async (
    token: string,
    data: {
      phone: string;
      password: string;
      countryOfResidence: string;
      paymentMethodId: string;
      paymentAccountSubType?: 'iban' | 'ach' | 'username' | null;
      paymentAccountData: string;
      taxId?: string;
      acceptedContract: boolean;
      acceptedTerms: boolean;
    },
  ): Promise<AuthResponse> => {
    const res = await apiFetch(`${API_BASE_URL}/api/public/contract-confirmation/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
};
