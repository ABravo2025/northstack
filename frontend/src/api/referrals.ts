import { API_BASE_URL, apiFetch, throwApiError } from './http.js';

// Referral program (2026-10-04) — the signed-in user's own membership, commissions and payouts.

export type PayoutMethod = 'wise' | 'payoneer' | 'paypal' | 'wire_intl' | 'bank_ar';
export type CommissionStatus = 'pending' | 'payable' | 'paid' | 'void';
export type ReferralStatus = 'trialing' | 'no_payment' | 'active' | 'completed' | 'void';

export interface ReferralRules {
  commissionPercent: number;
  commissionPayments: number;
  holdDays: number;
  minPayoutCents: Record<string, number>;
  trialDays: number;
  termsVersion: string;
}

export interface CurrencyTotal {
  payable: number;
  pending: number;
  paid: number;
  minPayout: number;
  ready: boolean;
}

export interface ReferralRow {
  id: string;
  companyName: string;
  createdAt: string;
  status: ReferralStatus;
  commissionCount: number;
  earned: Record<string, { payable: number; pending: number; paid: number }>;
}

export interface CommissionRow {
  id: string;
  companyName: string;
  paymentNumber: number;
  paymentCents: number;
  currency: string;
  commissionPercent: number;
  commissionCents: number;
  paymentPaidAt: string;
  dueAt: string;
  status: CommissionStatus;
  voidReason: string | null;
  payout: { id: string; number: string; transferredAt: string } | null;
}

export interface PayoutRow {
  id: string;
  number: string;
  currency: string;
  amountCents: number;
  payoutMethod: PayoutMethod;
  transferredAt: string;
  reference: string | null;
  receiptFileName: string;
  commissionCount: number;
}

export interface ReferralMembership {
  code: string;
  joinedAt: string;
  termsVersion: string;
  payoutMethod: PayoutMethod;
  payoutDetails: Record<string, string>;
  payoutSummary: string;
  totals: Record<string, CurrencyTotal>;
  referrals: ReferralRow[];
  commissions: CommissionRow[];
  payouts: PayoutRow[];
}

export interface MyReferrals {
  rules: ReferralRules;
  member: ReferralMembership | null;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function send(token: string, path: string, method: string, body: unknown): Promise<MyReferrals> {
  const res = await apiFetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...auth(token) },
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export const referralsApi = {
  me: async (token: string): Promise<MyReferrals> => {
    const res = await apiFetch(`${API_BASE_URL}/api/referrals/me`, { headers: auth(token) });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  join: (token: string, body: { payoutMethod: PayoutMethod; payoutDetails: Record<string, string>; acceptTerms: boolean; termsVersion: string }) =>
    send(token, '/api/referrals/me/join', 'POST', body),

  updatePayoutDetails: (token: string, body: { payoutMethod: PayoutMethod; payoutDetails: Record<string, string> }) =>
    send(token, '/api/referrals/me/payout-details', 'PUT', body),

  // The receipt as a Blob, so the page can hand it to the browser as a download.
  receipt: async (token: string, payoutId: string): Promise<Blob> => {
    const res = await apiFetch(`${API_BASE_URL}/api/referrals/me/payouts/${encodeURIComponent(payoutId)}/receipt`, { headers: auth(token) });
    if (!res.ok) await throwApiError(res);
    return res.blob();
  },
};
