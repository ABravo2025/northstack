import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { PlanTier, Subscription } from './types.js';

export interface StartCheckoutResult {
  provider: 'paddle' | 'mercadopago';
  initPoint?: string;
  paddleTransactionId?: string;
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

  startCheckout: async (token: string): Promise<StartCheckoutResult> => {
    const res = await apiFetch(`${API_BASE_URL}/api/subscriptions/me/checkout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
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

  // Paddle-only (2026-08-19) — the URL Paddle returns is temporary (~1h), fetched fresh on each
  // click rather than cached anywhere. disposition 'inline' opens the PDF in a new tab,
  // 'attachment' makes the browser save it directly — same param Paddle's own endpoint takes.
  getInvoiceDocumentUrl: async (token: string, invoiceId: string, disposition: 'inline' | 'attachment' = 'inline'): Promise<string> => {
    const res = await apiFetch(`${API_BASE_URL}/api/subscriptions/me/invoices/${invoiceId}/document?disposition=${disposition}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    const data = await res.json();
    return data.url;
  },
};
