import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { PlanTier, Subscription } from './types.js';

export interface StartCheckoutResult {
  provider: 'dodopayments' | 'mercadopago';
  initPoint?: string; // hosted redirect URL for either provider
}

export const billingApi = {
  getSubscription: async (token: string): Promise<Subscription> => {
    const res = await apiFetch(`${API_BASE_URL}/api/subscriptions/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    const data = await res.json();
    return data.subscription;
  },

  // `plan` (2026-09-15, QA-88) — required for a first-time subscribe (no provider yet); the
  // backend now defers writing Tenant.plan until the checkout's payment actually confirms,
  // instead of BillingPage/PlansModal setting it upfront via updateTenantPlan. Omitted (and
  // ignored server-side) when just updating the payment method on an already-active subscription.
  startCheckout: async (token: string, plan?: PlanTier): Promise<StartCheckoutResult> => {
    const res = await apiFetch(`${API_BASE_URL}/api/subscriptions/me/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plan }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // Named distinctly from auth.ts's updateTenantPlan (the pre-billing "which plan do you want"
  // choice, still used while trialing with no provider attached) — this one is the post-billing
  // self-serve change, only valid once a real provider is attached.
  changeSubscriptionPlan: async (token: string, plan: PlanTier): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/subscriptions/me/change-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plan }),
    });
    if (!res.ok) await throwApiError(res);
  },

  cancelSubscription: async (token: string, reason?: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/subscriptions/me/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) await throwApiError(res);
  },

  resumeSubscription: async (token: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/subscriptions/me/resume`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },

  // 2026-09-15, QA-89 — for a tenant whose plan choice never actually got confirmed by a
  // provider (no real subscription for cancelSubscription above to act on). Rejects server-side
  // once a provider IS attached — use cancelSubscription for that instead.
  clearUnconfirmedPlan: async (token: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/subscriptions/me/clear-plan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },

  // Dodo Payments-only (2026-08-19) — the invoice URL is fetched fresh on each click rather than
  // cached anywhere.
  getInvoiceDocumentUrl: async (token: string, invoiceId: string): Promise<string> => {
    const res = await apiFetch(`${API_BASE_URL}/api/subscriptions/me/invoices/${invoiceId}/document`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    const data = await res.json();
    return data.url;
  },
};
