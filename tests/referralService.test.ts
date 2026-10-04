import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

// Referral program (2026-10-04): commission math, the 3-payment cap, the 30-day hold, payout-detail
// validation, receipts. Prisma and the mailer are mocked; the rules come from the real REFERRAL.

const { db, emails } = vi.hoisted(() => ({
  db: {
    referral: { findUnique: vi.fn() },
    referralCommission: { create: vi.fn(), updateMany: vi.fn() },
  },
  emails: { commission: vi.fn(async () => {}), payout: vi.fn(async () => {}) },
}));

vi.mock('../src/lib/prisma.js', () => ({ default: db }));
vi.mock('../src/lib/mailer.js', () => ({
  sendReferralCommissionEmail: emails.commission,
  sendReferralPayoutEmail: emails.payout,
}));

import { REFERRAL } from '../src/config/pricing.js';
import {
  commissionView,
  decodeReceipt,
  generateReferralCode,
  normalizeReferralCode,
  recordReferralCommission,
  referralView,
  totalsByCurrency,
  validatePayoutDetails,
  voidCommission,
} from '../src/modules/referral/referralService.js';

const DAY = 24 * 60 * 60 * 1000;

function referralWith(commissionCount: number) {
  return {
    id: 'ref_1',
    referredTenantName: 'Nube Café',
    member: { email: 'lucia@example.com', name: 'Lucía Fernández', user: { locale: 'es' } },
    _count: { commissions: commissionCount },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.referralCommission.create.mockImplementation(async ({ data }: any) => data);
});

describe('recordReferralCommission', () => {
  const paidAt = new Date('2027-01-12T10:00:00Z');

  it('earns 10% of the payment, payable 30 days later, and emails the member', async () => {
    db.referral.findUnique.mockResolvedValue(referralWith(0));
    await recordReferralCommission({ tenantId: 't1', invoiceId: 'inv_1', amountCents: 24000, currency: 'USD', paidAt });

    const data = db.referralCommission.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ referralId: 'ref_1', invoiceId: 'inv_1', paymentNumber: 1, paymentCents: 24000, commissionPercent: 10, commissionCents: 2400, currency: 'USD' });
    expect(data.dueAt.getTime() - paidAt.getTime()).toBe(REFERRAL.holdDays * DAY);
    expect(emails.commission).toHaveBeenCalledWith(expect.objectContaining({ to: 'lucia@example.com', commissionCents: 2400, paymentNumber: 1, locale: 'es' }));
  });

  it('rounds ARS centavos and numbers the third payment', async () => {
    db.referral.findUnique.mockResolvedValue(referralWith(2));
    await recordReferralCommission({ tenantId: 't1', invoiceId: 'inv_3', amountCents: 1_800_005, currency: 'ARS', paidAt });
    expect(db.referralCommission.create.mock.calls[0][0].data).toMatchObject({ paymentNumber: 3, commissionCents: 180_001 });
  });

  it('stops after the first 3 payments', async () => {
    db.referral.findUnique.mockResolvedValue(referralWith(3));
    await recordReferralCommission({ tenantId: 't1', invoiceId: 'inv_4', amountCents: 24000, currency: 'USD', paidAt });
    expect(db.referralCommission.create).not.toHaveBeenCalled();
    expect(emails.commission).not.toHaveBeenCalled();
  });

  it('ignores $0 payments and tenants nobody referred', async () => {
    await recordReferralCommission({ tenantId: 't1', invoiceId: 'inv_0', amountCents: 0, currency: 'USD', paidAt });
    expect(db.referral.findUnique).not.toHaveBeenCalled();

    db.referral.findUnique.mockResolvedValue(null);
    await recordReferralCommission({ tenantId: 't2', invoiceId: 'inv_x', amountCents: 5000, currency: 'USD', paidAt });
    expect(db.referralCommission.create).not.toHaveBeenCalled();
  });

  it('a repeated webhook for the same invoice records nothing and sends no email', async () => {
    db.referral.findUnique.mockResolvedValue(referralWith(1));
    db.referralCommission.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }));
    await expect(recordReferralCommission({ tenantId: 't1', invoiceId: 'inv_1', amountCents: 24000, currency: 'USD', paidAt })).resolves.toBeUndefined();
    expect(emails.commission).not.toHaveBeenCalled();
  });
});

describe('derived states', () => {
  const now = new Date('2027-02-15T00:00:00Z');
  const row = (status: 'pending' | 'paid' | 'void', dueAt: string, cents = 1000, currency = 'USD') => ({ status, dueAt: new Date(dueAt), commissionCents: cents, currency });

  it('a pending commission becomes payable once its hold is over', () => {
    expect(commissionView(row('pending', '2027-02-14'), now)).toBe('payable');
    expect(commissionView(row('pending', '2027-03-10'), now)).toBe('pending');
    expect(commissionView(row('paid', '2027-01-01'), now)).toBe('paid');
    expect(commissionView(row('void', '2027-01-01'), now)).toBe('void');
  });

  it('totals per currency, skipping void ones', () => {
    const totals = totalsByCurrency(
      [row('pending', '2027-02-04', 1500), row('pending', '2027-03-10', 2400), row('paid', '2027-01-04', 5400), row('void', '2027-01-04', 600), row('pending', '2027-02-01', 900_000, 'ARS')],
      now,
    );
    expect(totals).toEqual({ USD: { payable: 1500, pending: 2400, paid: 5400 }, ARS: { payable: 900_000, pending: 0, paid: 0 } });
  });

  it('referral status follows its payments', () => {
    expect(referralView([], 'trialing')).toBe('trialing');
    expect(referralView([], 'cancelled')).toBe('no_payment');
    expect(referralView([row('pending', '2027-03-01')], 'active')).toBe('active');
    expect(referralView([row('paid', '2027-01-01'), row('paid', '2027-02-01'), row('pending', '2027-03-01')], 'active')).toBe('completed');
    expect(referralView([row('void', '2027-01-01')], 'cancelled')).toBe('void');
  });
});

describe('validatePayoutDetails', () => {
  it('requires the method fields and trims them', () => {
    expect(validatePayoutDetails('paypal', { email: ' lucia@example.com ', holderName: 'Lucía' })).toEqual({
      success: true,
      method: 'paypal',
      details: { email: 'lucia@example.com', holderName: 'Lucía' },
    });
    expect(validatePayoutDetails('paypal', { email: 'nope', holderName: 'Lucía' })).toMatchObject({ success: false, field: 'email' });
    expect(validatePayoutDetails('bitcoin', {})).toMatchObject({ success: false, field: 'payoutMethod' });
  });

  it('checks CBU and CUIT in Argentina, alias optional', () => {
    const ok = validatePayoutDetails('bank_ar', { holderName: 'Martín Gómez', taxId: '20-31458922-7', cbu: '0170099220000067812345' });
    expect(ok).toMatchObject({ success: true });
    expect(validatePayoutDetails('bank_ar', { holderName: 'M', taxId: '20314589227', cbu: '123' })).toMatchObject({ success: false, field: 'cbu' });
  });

  it('wires ask for the account by type: US routing + account, IBAN, or SWIFT + account', () => {
    const base = { holderName: 'A', holderAddress: 'B', bankName: 'C', bankCountry: 'X' };
    expect(validatePayoutDetails('wire_intl', base)).toMatchObject({ success: false, field: 'wireType' });

    expect(validatePayoutDetails('wire_intl', { ...base, wireType: 'ach', routingNumber: '021000021', accountNumber: '123456789' })).toMatchObject({
      success: true,
      details: { wireType: 'ach', routingNumber: '021000021', accountNumber: '123456789' },
    });
    expect(validatePayoutDetails('wire_intl', { ...base, wireType: 'ach', routingNumber: '12345', accountNumber: '123456789' })).toMatchObject({ success: false, field: 'routingNumber' });
    expect(validatePayoutDetails('wire_intl', { ...base, wireType: 'ach', routingNumber: '021000021' })).toMatchObject({ success: false, field: 'accountNumber' });

    expect(validatePayoutDetails('wire_intl', { ...base, wireType: 'iban', iban: 'DE89 3704 0044 0532 0130 00' })).toMatchObject({ success: true });
    expect(validatePayoutDetails('wire_intl', { ...base, wireType: 'iban', iban: 'NOT-AN-IBAN' })).toMatchObject({ success: false, field: 'iban' });

    expect(validatePayoutDetails('wire_intl', { ...base, wireType: 'swift', swift: 'COBADEFFXXX', accountNumber: '0532013000' })).toMatchObject({ success: true });
    expect(validatePayoutDetails('wire_intl', { ...base, wireType: 'swift', swift: 'COBA', accountNumber: '1' })).toMatchObject({ success: false, field: 'swift' });

    // Fields of another wire type are never stored.
    const ok = validatePayoutDetails('wire_intl', { ...base, wireType: 'iban', iban: 'DE89370400440532013000', routingNumber: '021000021' });
    expect(ok.success && 'routingNumber' in ok.details).toBe(false);
  });
});

describe('codes and receipts', () => {
  it('normalizes codes', () => {
    expect(normalizeReferralCode(' k7qm-4xpa ')).toBe('K7QM-4XPA');
    expect(normalizeReferralCode('<script>')).toBeNull();
    expect(normalizeReferralCode(42)).toBeNull();
  });

  it('generates random codes with nothing from the member', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateReferralCode()));
    expect(codes.size).toBe(200);
    for (const code of codes) {
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
      expect(normalizeReferralCode(code)).toBe(code);
    }
  });

  it('accepts PDF/JPG/PNG up to 2 MB only', () => {
    const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 test').toString('base64')}`;
    expect(decodeReceipt(pdf, 'comprobante "TR".pdf')).toMatchObject({ success: true, mimeType: 'application/pdf', fileName: 'comprobante _TR_.pdf' });
    expect(decodeReceipt('data:text/html;base64,PGgxPg==', 'x.html')).toMatchObject({ success: false, field: 'receipt' });
    const big = `data:image/png;base64,${Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')}`;
    expect(decodeReceipt(big, 'big.png')).toMatchObject({ success: false, field: 'receipt' });
    expect(decodeReceipt(undefined, undefined)).toMatchObject({ success: false, field: 'receipt' });
  });
});

describe('voidCommission', () => {
  it('needs a reason and only voids unpaid commissions', async () => {
    expect(await voidCommission('c1', '  ')).toMatchObject({ success: false, field: 'reason' });
    db.referralCommission.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await voidCommission('c1', 'Reembolso')).toEqual({ success: true });
    expect(db.referralCommission.updateMany.mock.calls[0][0].where).toEqual({ id: 'c1', status: 'pending', payoutId: null });
    db.referralCommission.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await voidCommission('c2', 'Reembolso')).toMatchObject({ success: false });
  });
});
