import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { PaymentsOverview, StripeCustomerMatch, StripePaymentEventsPage, StripePaymentSummary } from './types.js';

export const paymentsApi = {
  searchStripeCustomersForCompany: async (token: string, companyId: string): Promise<{ matches: StripeCustomerMatch[] }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/payments/companies/${companyId}/stripe-lookup`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // Throws ApiError with .status === 409 when the Company is already linked to a different
  // customer — callers should catch that, confirm with the user, and retry with
  // confirmOverwrite: true.
  linkCompanyToStripe: async (
    token: string,
    companyId: string,
    input: { stripeCustomerId: string; matchedViaEmail: string; confirmOverwrite?: boolean },
  ) => {
    const res = await apiFetch(`${API_BASE_URL}/api/payments/companies/${companyId}/stripe-link`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  getCompanyPaymentSummary: async (token: string, companyId: string): Promise<StripePaymentSummary> => {
    const res = await apiFetch(`${API_BASE_URL}/api/payments/companies/${companyId}/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  getCompanyPaymentEvents: async (token: string, companyId: string, cursor?: string): Promise<StripePaymentEventsPage> => {
    // Plain string concat, not new URL() — API_BASE_URL is '' in production/staging (same-origin
    // frontend+backend), and new URL() throws on a relative-only string with no base.
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const res = await apiFetch(`${API_BASE_URL}/api/payments/companies/${companyId}/events${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  getPaymentsOverview: async (token: string): Promise<PaymentsOverview> => {
    const res = await apiFetch(`${API_BASE_URL}/api/payments/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
};
