import { randomInt } from 'node:crypto';
import { Prisma, type ReferralPayoutMethod } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { REFERRAL } from '../../config/pricing.js';
import { decryptPaymentAccountData, encryptPaymentAccountData } from '../../lib/encryption.js';
import { isEmailFormatValid } from '../../lib/email.js';
import { sendReferralCommissionEmail, sendReferralPayoutEmail } from '../../lib/mailer.js';

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Referral program (2026-10-04, Alejandro — plan "Programa de referidos"). Platform users join with
// their payout details + the program terms, share a code, and earn REFERRAL.commissionPercent of the
// referred company's first REFERRAL.commissionPayments payments. Staff pay by hand from Admin Center
// and attach the transfer receipt. "Payable" is never stored: a pending commission whose dueAt has
// passed is payable, so nothing depends on a cron having run.

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_RECEIPT_BYTES = 2 * 1024 * 1024;
const RECEIPT_TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

export const PAYOUT_METHODS: ReferralPayoutMethod[] = ['wise', 'payoneer', 'paypal', 'wire_intl', 'bank_ar'];

type FieldRule = { key: string; required: boolean; check?: (v: string) => boolean };

const emailRule = (key: string): FieldRule => ({ key, required: true, check: isEmailFormatValid });
const text = (key: string, required = true): FieldRule => ({ key, required });

// The fields each method asks for (frontend ReferralsPage mirrors these keys).
export const PAYOUT_FIELDS: Record<ReferralPayoutMethod, FieldRule[]> = {
  wise: [emailRule('email'), text('holderName')],
  payoneer: [emailRule('email'), text('holderName')],
  paypal: [emailRule('email'), text('holderName')],
  // Common wire fields; the account itself depends on wireType (WIRE_ACCOUNT_FIELDS below).
  wire_intl: [text('holderName'), text('holderAddress'), text('bankName'), text('bankCountry')],
  bank_ar: [
    text('holderName'),
    { key: 'taxId', required: true, check: (v) => /^\d{11}$/.test(v.replace(/\D/g, '')) },
    { key: 'cbu', required: true, check: (v) => /^\d{22}$/.test(v.replace(/\D/g, '')) },
    text('alias', false),
  ],
};

// Wire transfers, like Payroll's IBAN/ACH (Alejandro, 2026-10-04): a US account gives routing +
// account number, a European one its IBAN, anywhere else SWIFT/BIC + account number.
export const WIRE_TYPES = ['ach', 'iban', 'swift'] as const;
export type WireType = (typeof WIRE_TYPES)[number];
const compact = (v: string) => v.replace(/[\s-]/g, '').toUpperCase();
export const WIRE_ACCOUNT_FIELDS: Record<WireType, FieldRule[]> = {
  ach: [
    { key: 'routingNumber', required: true, check: (v) => /^\d{9}$/.test(compact(v)) },
    { key: 'accountNumber', required: true, check: (v) => /^\d{4,17}$/.test(compact(v)) },
  ],
  iban: [{ key: 'iban', required: true, check: (v) => /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(compact(v)) }],
  swift: [
    { key: 'swift', required: true, check: (v) => /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(compact(v)) },
    text('accountNumber'),
  ],
};

export type PayoutDetails = Record<string, string>;
type Result<T = object> = ({ success: true } & T) | { success: false; error: string; field?: string };

export function validatePayoutDetails(method: unknown, raw: unknown): Result<{ method: ReferralPayoutMethod; details: PayoutDetails }> {
  if (typeof method !== 'string' || !PAYOUT_METHODS.includes(method as ReferralPayoutMethod)) {
    return { success: false, error: 'Choose how you want to get paid.', field: 'payoutMethod' };
  }
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const details: PayoutDetails = {};
  let rules = PAYOUT_FIELDS[method as ReferralPayoutMethod];
  if (method === 'wire_intl') {
    const wireType = input.wireType;
    if (typeof wireType !== 'string' || !WIRE_TYPES.includes(wireType as WireType)) {
      return { success: false, error: 'Choose where the bank account is.', field: 'wireType' };
    }
    details.wireType = wireType;
    rules = [...rules, ...WIRE_ACCOUNT_FIELDS[wireType as WireType]];
  }
  for (const rule of rules) {
    const value = typeof input[rule.key] === 'string' ? (input[rule.key] as string).trim().slice(0, 200) : '';
    if (!value) {
      if (rule.required) return { success: false, error: 'This field is required.', field: rule.key };
      continue;
    }
    if (rule.check && !rule.check(value)) {
      return { success: false, error: 'Check this value.', field: rule.key };
    }
    details[rule.key] = value;
  }
  return { success: true, method: method as ReferralPayoutMethod, details };
}

function decryptDetails(encrypted: string): PayoutDetails {
  try {
    return JSON.parse(decryptPaymentAccountData(encrypted)) as PayoutDetails;
  } catch {
    return {};
  }
}

// What a member sees about their own payout account in lists: never the full number.
function payoutSummary(method: ReferralPayoutMethod, details: PayoutDetails): string {
  const last4 = (v?: string) => (v ? `•••• ${v.replace(/\s/g, '').slice(-4)}` : '');
  if (details.email) {
    const [name, domain] = details.email.split('@');
    return `${name.slice(0, 2)}•••@${domain}`;
  }
  if (method === 'bank_ar') return details.alias || last4(details.cbu);
  return last4(details.iban ?? details.accountNumber);
}

// ---------- codes ----------

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L

// Fully random, e.g. "K7QM-4XPA" — never derived from the member's name, so a shared link says
// nothing about who sent it (Alejandro, 2026-10-04). 31^8 ≈ 8.5e11 combinations.
export function generateReferralCode(): string {
  const chunk = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `${chunk()}-${chunk()}`;
}

export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9-]{3,20}$/.test(code) ? code : null;
}

// ---------- member: join / payout details / own view ----------

export async function joinReferralProgram(
  userId: string,
  body: { payoutMethod?: unknown; payoutDetails?: unknown; acceptTerms?: unknown; termsVersion?: unknown },
): Promise<Result<{ code: string }>> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, firstName: true, lastName: true, email: true, status: true, tenantId: true } });
  if (!user || user.status !== 'active' || !user.tenantId) {
    return { success: false, error: 'Only active Northstack users can join the referral program.' };
  }
  const existing = await prisma.referralMember.findUnique({ where: { userId } });
  if (existing) return { success: true, code: existing.code };

  // Payout details first, then the terms — the terms can't be accepted without them (Alejandro).
  const payout = validatePayoutDetails(body.payoutMethod, body.payoutDetails);
  if (!payout.success) return payout;
  if (body.acceptTerms !== true || body.termsVersion !== REFERRAL.termsVersion) {
    return { success: false, error: 'Accept the program terms to join.', field: 'acceptTerms' };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      await prisma.referralMember.create({
        data: {
          userId,
          name: `${user.firstName} ${user.lastName}`.trim(),
          email: user.email,
          code,
          payoutMethod: payout.method,
          payoutDetailsEncrypted: encryptPaymentAccountData(JSON.stringify(payout.details)),
          termsVersion: REFERRAL.termsVersion,
          termsAcceptedAt: new Date(),
        },
      });
      return { success: true, code };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Either the code collided (retry) or this user joined in a parallel request.
        const raced = await prisma.referralMember.findUnique({ where: { userId } });
        if (raced) return { success: true, code: raced.code };
        continue;
      }
      throw error;
    }
  }
  throw new Error('Could not generate a unique referral code');
}

export async function updateReferralPayoutDetails(userId: string, body: { payoutMethod?: unknown; payoutDetails?: unknown }): Promise<Result> {
  const member = await prisma.referralMember.findUnique({ where: { userId } });
  if (!member) return { success: false, error: 'You are not in the referral program yet.' };
  const payout = validatePayoutDetails(body.payoutMethod, body.payoutDetails);
  if (!payout.success) return payout;
  await prisma.referralMember.update({
    where: { id: member.id },
    data: { payoutMethod: payout.method, payoutDetailsEncrypted: encryptPaymentAccountData(JSON.stringify(payout.details)) },
  });
  return { success: true };
}

export type CommissionView = 'pending' | 'payable' | 'paid' | 'void';
export type ReferralView = 'trialing' | 'no_payment' | 'active' | 'completed' | 'void';

type CommissionRow = {
  status: 'pending' | 'paid' | 'void';
  dueAt: Date;
  currency: string;
  commissionCents: number;
};

export function commissionView(c: CommissionRow, now = new Date()): CommissionView {
  if (c.status === 'paid') return 'paid';
  if (c.status === 'void') return 'void';
  return c.dueAt <= now ? 'payable' : 'pending';
}

export function referralView(commissions: CommissionRow[], tenantStatus: string | null | undefined): ReferralView {
  if (commissions.length === 0) return tenantStatus === 'trialing' ? 'trialing' : 'no_payment';
  const live = commissions.filter((c) => c.status !== 'void');
  if (live.length === 0) return 'void';
  return commissions.length >= REFERRAL.commissionPayments ? 'completed' : 'active';
}

export type CurrencyTotals = Record<string, { payable: number; pending: number; paid: number }>;

export function totalsByCurrency(commissions: CommissionRow[], now = new Date()): CurrencyTotals {
  const totals: CurrencyTotals = {};
  for (const c of commissions) {
    const view = commissionView(c, now);
    if (view === 'void') continue;
    const t = (totals[c.currency] ??= { payable: 0, pending: 0, paid: 0 });
    t[view] += c.commissionCents;
  }
  return totals;
}

export function minPayoutCents(currency: string): number {
  return REFERRAL.minPayoutCents[currency] ?? Number.POSITIVE_INFINITY;
}

const memberInclude = {
  referrals: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      referredTenant: { select: { status: true } },
      commissions: { orderBy: { paymentPaidAt: 'desc' as const }, include: { payout: { select: { id: true, transferredAt: true } } } },
    },
  },
  payouts: {
    orderBy: { transferredAt: 'desc' as const },
    select: { id: true, currency: true, amountCents: true, payoutMethod: true, transferredAt: true, reference: true, receiptFileName: true, createdAt: true, _count: { select: { commissions: true } } },
  },
} satisfies Prisma.ReferralMemberInclude;

type MemberWithAll = Prisma.ReferralMemberGetPayload<{ include: typeof memberInclude }>;

// Payout numbers shown to people ("TR-0003") — stable per payout, ordered by creation.
async function payoutNumbers(payoutIds: string[]): Promise<Map<string, string>> {
  if (payoutIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ id: string; n: bigint }[]>`
    SELECT id, n FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id) AS n FROM "ReferralPayout") t
    WHERE id IN (${Prisma.join(payoutIds)})`;
  return new Map(rows.map((r) => [r.id, `TR-${String(r.n).padStart(4, '0')}`]));
}

async function shapeMember(member: MemberWithAll, now = new Date()) {
  const allCommissions = member.referrals.flatMap((r) => r.commissions);
  const numbers = await payoutNumbers(member.payouts.map((p) => p.id));
  const totals = totalsByCurrency(allCommissions, now);
  return {
    totals: Object.fromEntries(
      Object.entries(totals).map(([cur, t]) => [cur, { ...t, minPayout: minPayoutCents(cur), ready: t.payable > 0 && t.payable >= minPayoutCents(cur) }]),
    ),
    referrals: member.referrals.map((r) => ({
      id: r.id,
      companyName: r.referredTenantName,
      createdAt: r.createdAt,
      status: referralView(r.commissions, r.referredTenant?.status ?? null),
      commissionCount: r.commissions.filter((c) => c.status !== 'void').length,
      earned: totalsByCurrency(r.commissions, now),
    })),
    commissions: member.referrals
      .flatMap((r) => r.commissions.map((c) => ({ c, companyName: r.referredTenantName, referralId: r.id })))
      .sort((a, b) => b.c.paymentPaidAt.getTime() - a.c.paymentPaidAt.getTime())
      .map(({ c, companyName, referralId }) => ({
        id: c.id,
        referralId,
        companyName,
        paymentNumber: c.paymentNumber,
        paymentCents: c.paymentCents,
        currency: c.currency,
        commissionPercent: c.commissionPercent,
        commissionCents: c.commissionCents,
        paymentPaidAt: c.paymentPaidAt,
        dueAt: c.dueAt,
        status: commissionView(c, now),
        voidReason: c.voidReason,
        payout: c.payout ? { id: c.payout.id, number: numbers.get(c.payout.id) ?? '', transferredAt: c.payout.transferredAt } : null,
      })),
    payouts: member.payouts.map((p) => ({
      id: p.id,
      number: numbers.get(p.id) ?? '',
      currency: p.currency,
      amountCents: p.amountCents,
      payoutMethod: p.payoutMethod,
      transferredAt: p.transferredAt,
      reference: p.reference,
      receiptFileName: p.receiptFileName,
      commissionCount: p._count.commissions,
    })),
  };
}

export async function getMyReferrals(userId: string) {
  const member = await prisma.referralMember.findUnique({ where: { userId }, include: memberInclude });
  const rules = {
    commissionPercent: REFERRAL.commissionPercent,
    commissionPayments: REFERRAL.commissionPayments,
    holdDays: REFERRAL.holdDays,
    minPayoutCents: REFERRAL.minPayoutCents,
    trialDays: REFERRAL.trialDays,
    termsVersion: REFERRAL.termsVersion,
  };
  if (!member) return { member: null, rules };
  const details = decryptDetails(member.payoutDetailsEncrypted);
  return {
    rules,
    member: {
      code: member.code,
      joinedAt: member.termsAcceptedAt,
      termsVersion: member.termsVersion,
      payoutMethod: member.payoutMethod,
      // The member's own data, so they can edit it.
      payoutDetails: details,
      payoutSummary: payoutSummary(member.payoutMethod, details),
      ...(await shapeMember(member)),
    },
  };
}

export async function getPayoutReceiptForUser(userId: string, payoutId: string) {
  const payout = await prisma.referralPayout.findFirst({
    where: { id: payoutId, member: { userId } },
    select: { receiptData: true, receiptMimeType: true, receiptFileName: true },
  });
  return payout ? { bytes: Buffer.from(payout.receiptData), mimeType: payout.receiptMimeType, fileName: payout.receiptFileName } : null;
}

// ---------- signup attribution ----------

// A code is valid if its member still has an active user account.
export async function findActiveMemberByCode(raw: unknown) {
  const code = normalizeReferralCode(raw);
  if (!code) return null;
  const member = await prisma.referralMember.findUnique({ where: { code }, include: { user: { select: { status: true, tenantId: true } } } });
  if (!member?.user || member.user.status !== 'active') return null;
  return member;
}

export async function attachReferral(
  tx: PrismaTx,
  member: { id: string; user: { tenantId: string | null } | null },
  tenant: { id: string; name: string },
): Promise<void> {
  // A member's own company can't be referred (only a brand-new tenant reaches here, so this is
  // belt and braces).
  if (member.user?.tenantId === tenant.id) return;
  await tx.referral.create({ data: { memberId: member.id, referredTenantId: tenant.id, referredTenantName: tenant.name } });
}

// ---------- commissions (called from the billing webhooks) ----------

export async function recordReferralCommission(input: {
  tenantId: string;
  invoiceId: string;
  amountCents: number;
  currency: string;
  paidAt: Date;
}): Promise<void> {
  if (input.amountCents <= 0) return;
  const referral = await prisma.referral.findUnique({
    where: { referredTenantId: input.tenantId },
    include: { member: { include: { user: { select: { locale: true } } } }, _count: { select: { commissions: true } } },
  });
  if (!referral) return;
  const paymentNumber = referral._count.commissions + 1;
  if (paymentNumber > REFERRAL.commissionPayments) return;

  const commissionCents = Math.round((input.amountCents * REFERRAL.commissionPercent) / 100);
  const dueAt = new Date(input.paidAt.getTime() + REFERRAL.holdDays * DAY_MS);
  try {
    await prisma.referralCommission.create({
      data: {
        referralId: referral.id,
        invoiceId: input.invoiceId,
        paymentNumber,
        paymentCents: input.amountCents,
        currency: input.currency,
        commissionPercent: REFERRAL.commissionPercent,
        commissionCents,
        paymentPaidAt: input.paidAt,
        dueAt,
      },
    });
  } catch (error) {
    // Same invoice twice (webhook retry) or two payments racing for the same paymentNumber.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
    throw error;
  }

  await sendReferralCommissionEmail({
    to: referral.member.email,
    firstName: referral.member.name.split(' ')[0] ?? referral.member.name,
    companyName: referral.referredTenantName,
    commissionCents,
    currency: input.currency,
    paymentNumber,
    totalPayments: REFERRAL.commissionPayments,
    dueAt,
    locale: referral.member.user?.locale,
  });
}

// ---------- Admin Center ----------

export async function listMembersForAdmin() {
  const now = new Date();
  const members = await prisma.referralMember.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { tenant: { select: { id: true, name: true } } } },
      referrals: { select: { commissions: { select: { status: true, dueAt: true, currency: true, commissionCents: true } } } },
    },
  });
  return members.map((m) => {
    const totals = totalsByCurrency(m.referrals.flatMap((r) => r.commissions), now);
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      tenant: m.user?.tenant ?? null,
      code: m.code,
      payoutMethod: m.payoutMethod,
      joinedAt: m.termsAcceptedAt,
      referralCount: m.referrals.length,
      totals: Object.fromEntries(
        Object.entries(totals).map(([cur, t]) => [cur, { ...t, minPayout: minPayoutCents(cur), ready: t.payable > 0 && t.payable >= minPayoutCents(cur) }]),
      ),
    };
  });
}

export async function getMemberForAdmin(memberId: string) {
  const member = await prisma.referralMember.findUnique({
    where: { id: memberId },
    include: { ...memberInclude, user: { select: { status: true, tenant: { select: { id: true, name: true } } } } },
  });
  if (!member) return null;
  return {
    id: member.id,
    name: member.name,
    email: member.email,
    code: member.code,
    tenant: member.user?.tenant ?? null,
    userActive: member.user?.status === 'active',
    termsVersion: member.termsVersion,
    termsAcceptedAt: member.termsAcceptedAt,
    payoutMethod: member.payoutMethod,
    payoutDetails: decryptDetails(member.payoutDetailsEncrypted),
    ...(await shapeMember(member)),
  };
}

export function decodeReceipt(raw: unknown, fileName: unknown): Result<{ bytes: Buffer; mimeType: string; fileName: string }> {
  if (typeof raw !== 'string' || !raw) return { success: false, error: 'Subí el comprobante de la transferencia.', field: 'receipt' };
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(raw);
  const mimeType = match?.[1] ?? '';
  if (!RECEIPT_TYPES[mimeType]) return { success: false, error: 'El comprobante tiene que ser PDF, JPG o PNG.', field: 'receipt' };
  const base64 = match![2];
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return { success: false, error: 'No se pudo leer el archivo.', field: 'receipt' };
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_RECEIPT_BYTES) return { success: false, error: 'El comprobante pesa más de 2 MB.', field: 'receipt' };
  const name = typeof fileName === 'string' && fileName.trim() ? fileName.trim().replace(/[^\w.\- ]/g, '_').slice(0, 120) : `comprobante.${RECEIPT_TYPES[mimeType]}`;
  return { success: true, bytes, mimeType, fileName: name };
}

export async function createPayout(
  memberId: string,
  body: { currency?: unknown; transferredAt?: unknown; reference?: unknown; receipt?: unknown; receiptFileName?: unknown },
  staffUserId: string,
): Promise<Result<{ payoutId: string }>> {
  const currency = typeof body.currency === 'string' ? body.currency : '';
  const transferredAt = typeof body.transferredAt === 'string' ? new Date(body.transferredAt) : new Date(NaN);
  if (Number.isNaN(transferredAt.getTime()) || transferredAt.getTime() > Date.now() + DAY_MS) {
    return { success: false, error: 'Poné la fecha de la transferencia.', field: 'transferredAt' };
  }
  const receipt = decodeReceipt(body.receipt, body.receiptFileName);
  if (!receipt.success) return receipt;
  const reference = typeof body.reference === 'string' && body.reference.trim() ? body.reference.trim().slice(0, 120) : null;

  const now = new Date();
  const payout = await prisma.$transaction(async (tx) => {
    const member = await tx.referralMember.findUnique({ where: { id: memberId } });
    if (!member) return { error: 'No existe ese miembro.' };
    const payable = await tx.referralCommission.findMany({
      where: { status: 'pending', payoutId: null, currency, dueAt: { lte: now }, referral: { memberId } },
      select: { id: true, commissionCents: true },
    });
    const amountCents = payable.reduce((sum, c) => sum + c.commissionCents, 0);
    if (amountCents === 0) return { error: `No hay comisiones en ${currency || 'esa moneda'} para pagar.` };
    if (amountCents < minPayoutCents(currency)) return { error: 'Todavía no llegó al mínimo para pagar.' };
    const created = await tx.referralPayout.create({
      data: {
        memberId,
        currency,
        amountCents,
        payoutMethod: member.payoutMethod,
        transferredAt,
        reference,
        receiptData: receipt.bytes,
        receiptMimeType: receipt.mimeType,
        receiptFileName: receipt.fileName,
        createdByUserId: staffUserId,
      },
    });
    // Only the rows read above, and only if still pending — a parallel void can't be overwritten.
    const updated = await tx.referralCommission.updateMany({
      where: { id: { in: payable.map((c) => c.id) }, status: 'pending', payoutId: null },
      data: { status: 'paid', payoutId: created.id },
    });
    if (updated.count !== payable.length) throw new Error('Commissions changed while registering the payout — try again');
    return { payout: created, member };
  });
  if ('error' in payout) return { success: false, error: payout.error as string };

  const user = payout.member.userId ? await prisma.user.findUnique({ where: { id: payout.member.userId }, select: { locale: true } }) : null;
  const number = (await payoutNumbers([payout.payout.id])).get(payout.payout.id) ?? '';
  await sendReferralPayoutEmail({
    to: payout.member.email,
    firstName: payout.member.name.split(' ')[0] ?? payout.member.name,
    payoutNumber: number,
    amountCents: payout.payout.amountCents,
    currency,
    transferredAt,
    reference,
    receipt: { fileName: receipt.fileName, content: receipt.bytes, mimeType: receipt.mimeType },
    locale: user?.locale,
  });
  return { success: true, payoutId: payout.payout.id };
}

export async function voidCommission(commissionId: string, reason: unknown): Promise<Result> {
  const text = typeof reason === 'string' ? reason.trim().slice(0, 300) : '';
  if (!text) return { success: false, error: 'Escribí el motivo.', field: 'reason' };
  const { count } = await prisma.referralCommission.updateMany({
    where: { id: commissionId, status: 'pending', payoutId: null },
    data: { status: 'void', voidReason: text, voidedAt: new Date() },
  });
  return count === 1 ? { success: true } : { success: false, error: 'Solo se puede anular una comisión que todavía no se pagó.' };
}

export async function getPayoutReceiptForAdmin(payoutId: string) {
  const payout = await prisma.referralPayout.findUnique({ where: { id: payoutId }, select: { receiptData: true, receiptMimeType: true, receiptFileName: true } });
  return payout ? { bytes: Buffer.from(payout.receiptData), mimeType: payout.receiptMimeType, fileName: payout.receiptFileName } : null;
}
