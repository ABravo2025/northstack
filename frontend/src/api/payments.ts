import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type {
  CompanyStripeInvoicesPage,
  PaymentsOverview,
  SendCompanyInvoiceInput,
  SentStripeInvoice,
  StripeCustomerMatch,
  StripePaymentEventsPage,
  StripePaymentSummary,
} from './types.js';

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

  // A 400 with ApiError.field === 'stripe_key_permission' means the tenant's Stripe key lacks
  // Invoices: Write — the message already says how to fix it in Stripe.
  sendCompanyInvoice: async (token: string, companyId: string, input: SendCompanyInvoiceInput): Promise<SentStripeInvoice> => {
    const res = await apiFetch(`${API_BASE_URL}/api/payments/companies/${companyId}/invoices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  getCompanyInvoices: async (token: string, companyId: string, cursor?: string): Promise<CompanyStripeInvoicesPage> => {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const res = await apiFetch(`${API_BASE_URL}/api/payments/companies/${companyId}/invoices${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  getPaymentsOverview: async (token: string, period?: { since: Date; until: Date }): Promise<PaymentsOverview> => {
    const query = period ? `?since=${encodeURIComponent(period.since.toISOString())}&until=${encodeURIComponent(period.until.toISOString())}` : '';
    const res = await apiFetch(`${API_BASE_URL}/api/payments/overview${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
};
