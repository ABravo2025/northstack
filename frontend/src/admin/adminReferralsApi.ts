import { API_BASE_URL } from '../api/http';
import { AdminApiError, call } from './adminApi';

// Admin Center — referral program (2026-10-04). platform_admin only (payout details are shown).

export type PayoutMethod = 'wise' | 'payoneer' | 'paypal' | 'wire_intl' | 'bank_ar';

export interface MemberTotals {
  payable: number;
  pending: number;
  paid: number;
  minPayout: number;
  ready: boolean;
}

export interface ReferralMemberRow {
  id: string;
  name: string;
  email: string;
  tenant: { id: string; name: string } | null;
  code: string;
  payoutMethod: PayoutMethod;
  joinedAt: string;
  referralCount: number;
  totals: Record<string, MemberTotals>;
}

export interface ReferralMemberDetail {
  id: string;
  name: string;
  email: string;
  code: string;
  tenant: { id: string; name: string } | null;
  userActive: boolean;
  termsVersion: string;
  termsAcceptedAt: string;
  payoutMethod: PayoutMethod;
  payoutDetails: Record<string, string>;
  totals: Record<string, MemberTotals>;
  referrals: {
    id: string;
    companyName: string;
    createdAt: string;
    status: 'trialing' | 'no_payment' | 'active' | 'completed' | 'void';
    commissionCount: number;
  }[];
  commissions: {
    id: string;
    referralId: string;
    companyName: string;
    paymentNumber: number;
    paymentCents: number;
    currency: string;
    commissionCents: number;
    paymentPaidAt: string;
    dueAt: string;
    status: 'pending' | 'payable' | 'paid' | 'void';
    voidReason: string | null;
    payout: { id: string; number: string; transferredAt: string } | null;
  }[];
  payouts: {
    id: string;
    number: string;
    currency: string;
    amountCents: number;
    payoutMethod: PayoutMethod;
    transferredAt: string;
    reference: string | null;
    receiptFileName: string;
    commissionCount: number;
  }[];
}

export const adminReferralsApi = {
  list: (token: string) => call<ReferralMemberRow[]>('/api/platform/admin/referrals', token),
  detail: (token: string, id: string) => call<ReferralMemberDetail>(`/api/platform/admin/referrals/${encodeURIComponent(id)}`, token),
  pay: (token: string, id: string, body: { currency: string; transferredAt: string; reference: string; receipt: string; receiptFileName: string }) =>
    call<{ success: true; payoutId: string }>(`/api/platform/admin/referrals/${encodeURIComponent(id)}/payouts`, token, { method: 'POST', body: JSON.stringify(body) }),
  voidCommission: (token: string, commissionId: string, reason: string) =>
    call<{ success: true }>(`/api/platform/admin/referrals/commissions/${encodeURIComponent(commissionId)}/void`, token, { method: 'POST', body: JSON.stringify({ reason }) }),
  receipt: async (token: string, payoutId: string): Promise<Blob> => {
    const res = await fetch(`${API_BASE_URL}/api/platform/admin/referrals/payouts/${encodeURIComponent(payoutId)}/receipt`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new AdminApiError(`Error ${res.status}`, res.status);
    return res.blob();
  },
};
