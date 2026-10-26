import { asksFor } from './paymentMethodService.js';
import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma.js';
import type { EmployeeCompensation, PaymentAccountSubType, Session, Tenant, User } from '@prisma/client';
import { findInvitationByToken } from '../tenant/invitationService.js';
import {
  hashPassword,
  isPasswordValid,
  isPhoneValid,
  newSessionExpiry,
  PASSWORD_POLICY_MESSAGE,
  PHONE_POLICY_MESSAGE,
} from '../auth/authService.js';
import { encryptPaymentAccountData } from '../../lib/encryption.js';
import { renderContractPdf } from './contractPdfService.js';
import { toTenantBranding } from '../tenant/tenantProfileService.js';
import { sendContractSignedEmail } from '../../lib/mailer.js';
import { getEmailDomain } from '../../lib/email.js';
import { seatCapError, syncSeatBilling } from '../tenant/seatService.js';
import { bestEffort } from '../../lib/bestEffort.js';
import { getPlanLimits } from '../tenant/planLimits.js';
import { isPaymentEncryptionConfigured } from '../../lib/encryption.js';
import { personTaxIdKind, personTaxIdRequired, taxIdLabel, validateTaxId, type TaxIdKind } from '../../lib/taxId.js';
import { hasEmployeeTaxId, setEmployeeTaxId } from './employeeTaxIdService.js';

// Public, token-gated read model for the contract-confirmation screen
// (docs/spec-payroll.md Unidad 7) — split into a read-only block (what the
// owner already entered) and an editable block (what the person still needs
// to fill in), matching the spec's own split of the page.
export interface ContractConfirmationDetails {
  tenantName: string;
  employeeFirstName: string;
  employeeLastName: string;
  email: string;
  jobTitle: string;
  description: string;
  compensationType: 'hourly' | 'fixed';
  rateCents: number;
  currency: string;
  payFrequencyName: string;
  effectiveFrom: string;
  nationality: string | null;
  timeOffPolicyNames: string[];
  // Payroll v2: kind/asks decide which account detail the form asks for.
  paymentMethods: { id: string; name: string; kind: string; asks: string }[];
  // Payroll v2 (2026-10-26): the person's own tax ID (CUIL / SSN / other), asked here when whoever
  // added them didn't fill it in — null when it's already set or not collected (no Payroll / key).
  taxId: { kind: TaxIdKind; required: boolean } | null;
}

export interface GetContractConfirmationResult {
  success: boolean;
  details?: ContractConfirmationDetails;
  error?: string;
}

async function loadPendingInvitationWithContract(token: string) {
  const invitation = await findInvitationByToken(token);
  if (!invitation || !invitation.employeeId) {
    return { error: 'Invitation not found' } as const;
  }
  if (invitation.status !== 'pending') {
    return { error: 'This invitation is no longer valid' } as const;
  }
  if (invitation.expiresAt < new Date()) {
    return { error: 'This invitation has expired' } as const;
  }

  const employee = await prisma.employee.findUnique({
    where: { id: invitation.employeeId },
    include: {
      timeOffPolicies: { include: { timeOffPolicy: true } },
      compensations: {
        where: { effectiveTo: null },
        include: { payFrequency: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!employee) {
    return { error: 'Employee not found' } as const;
  }
  if (employee.userId) {
    return { error: 'This contract was already confirmed' } as const;
  }

  const compensation = employee.compensations[0];
  if (!compensation) {
    return { error: 'No contract found for this invitation' } as const;
  }
  if (compensation.confirmedAt) {
    return { error: 'This contract was already confirmed' } as const;
  }

  return { invitation, employee, compensation } as const;
}

export async function getContractConfirmationDetails(token: string): Promise<GetContractConfirmationResult> {
  const loaded = await loadPendingInvitationWithContract(token);
  if ('error' in loaded) {
    return { success: false, error: loaded.error };
  }
  const { invitation, employee, compensation } = loaded;

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: invitation.tenantId } });
  const paymentMethods = await listSigningPaymentMethods(invitation.tenantId);

  return {
    success: true,
    details: {
      tenantName: tenant.name,
      employeeFirstName: employee.firstName,
      employeeLastName: employee.lastName,
      email: invitation.email,
      jobTitle: compensation.jobTitle,
      description: compensation.description,
      compensationType: compensation.compensationType,
      rateCents: compensation.rateCents,
      currency: compensation.currency,
      payFrequencyName: compensation.payFrequency.name,
      effectiveFrom: compensation.effectiveFrom.toISOString(),
      nationality: employee.nationality,
      timeOffPolicyNames: employee.timeOffPolicies.map((a) => a.timeOffPolicy.name),
      paymentMethods,
      taxId: (await taxIdAsked(tenant, employee.id, employee.personType)),
    },
  };
}

// Shared with My contract (employeeContractsService.ts) — both signing flows ask the same thing.
export async function taxIdAsked(tenant: Tenant, employeeId: string, personType: string | null): Promise<{ kind: TaxIdKind; required: boolean } | null> {
  if (!getPlanLimits(tenant).payrollEnabled || !isPaymentEncryptionConfigured()) return null;
  if (await hasEmployeeTaxId(tenant.id, employeeId)) return null;
  return { kind: personTaxIdKind(tenant.country), required: personTaxIdRequired(tenant.country, personType) };
}

// The tax ID typed while signing: null when fine (or nothing to check), else the error to show.
// Shared by both signing flows.
export function checkSigningTaxId(ask: { kind: TaxIdKind; required: boolean } | null, raw: string): string | null {
  if (!ask) return null;
  if (!raw && ask.required) return `${taxIdLabel(ask.kind)} is required`;
  if (raw) {
    const check = validateTaxId(ask.kind, raw);
    if (!check.ok) return check.error ?? 'Invalid tax ID';
  }
  return null;
}

// The payment methods a person picks from when signing — shared by the public invitation flow
// above and the logged-in one (employeeContractsService.ts's My contract).
export async function listSigningPaymentMethods(tenantId: string): Promise<ContractConfirmationDetails['paymentMethods']> {
  const methods = await prisma.paymentMethodDefinition.findMany({
    where: { tenantId, isActive: true },
    orderBy: { order: 'asc' },
  });
  return methods.map((m) => ({ id: m.id, name: m.name, kind: m.kind, asks: asksFor(m.kind === 'other' && m.name === 'Wire transfer' ? 'bank_intl' : m.kind) }));
}

// The signed version of a contract (same PDF as the draft, plus the date/time/IP evidence) —
// shared by both signing flows.
export async function renderSignedContractPdf(
  tenant: Parameters<typeof toTenantBranding>[0],
  employee: { firstName: string; lastName: string; nationality: string | null },
  compensation: EmployeeCompensation & { payFrequency: { name: string } },
  confirmedAt: Date,
  ip: string,
): Promise<Buffer> {
  const bytes = await renderContractPdf({
    company: toTenantBranding(tenant),
    employeeName: `${employee.firstName} ${employee.lastName}`,
    nationality: employee.nationality,
    jobTitle: compensation.jobTitle,
    description: compensation.description,
    compensationType: compensation.compensationType,
    rateCents: compensation.rateCents,
    currency: compensation.currency,
    payFrequencyName: compensation.payFrequency.name,
    effectiveFrom: compensation.effectiveFrom,
    signed: true,
    confirmedAt,
    confirmedIp: ip,
  });
  return Buffer.from(bytes);
}

// The signer's copy, cc'd to the tenant owner and whoever created the contract — shared by both
// signing flows. Must be awaited (see the note at the end of confirmContract).
export async function sendSignedContractCopy(input: {
  tenantId: string;
  tenantName: string;
  signer: { email: string; locale: string | null };
  employee: { firstName: string; lastName: string };
  createdByUserId: string;
  pdfBuffer: Buffer;
}): Promise<void> {
  const [owner, creator] = await Promise.all([
    prisma.user.findFirst({ where: { tenantId: input.tenantId, role: 'owner' } }),
    prisma.user.findUnique({ where: { id: input.createdByUserId } }),
  ]);
  const cc = [...new Set([owner?.email, creator?.email].filter((e): e is string => Boolean(e) && e !== input.signer.email))];
  await sendContractSignedEmail({
    to: input.signer.email,
    cc,
    tenantName: input.tenantName,
    employeeName: `${input.employee.firstName} ${input.employee.lastName}`,
    pdfBuffer: input.pdfBuffer,
    locale: input.signer.locale,
  });
}

export interface ConfirmContractInput {
  token: string;
  phone: string;
  password: string;
  countryOfResidence: string;
  paymentMethodId: string;
  paymentAccountSubType?: PaymentAccountSubType | null;
  paymentAccountData: string;
  taxId?: string;
  acceptedContract: boolean;
  acceptedTerms: boolean;
  ip: string;
}

export interface ConfirmContractResult {
  success: boolean;
  error?: string;
  field?: string;
  user?: User;
  session?: Session;
}

export async function confirmContract(input: ConfirmContractInput): Promise<ConfirmContractResult> {
  const loaded = await loadPendingInvitationWithContract(input.token);
  if ('error' in loaded) {
    return { success: false, error: loaded.error };
  }
  const { invitation, employee, compensation } = loaded;

  if (!input.acceptedContract) {
    return { success: false, error: 'You must accept the contract to continue', field: 'acceptedContract' };
  }
  if (!input.acceptedTerms) {
    return { success: false, error: 'You must accept the Terms of Service and Privacy Policy', field: 'acceptedTerms' };
  }
  if (!isPhoneValid(input.phone)) {
    return { success: false, error: PHONE_POLICY_MESSAGE, field: 'phone' };
  }
  if (!isPasswordValid(input.password)) {
    return { success: false, error: PASSWORD_POLICY_MESSAGE, field: 'password' };
  }
  if (!input.countryOfResidence.trim()) {
    return { success: false, error: 'Country of residence is required', field: 'countryOfResidence' };
  }
  if (!input.paymentAccountData.trim()) {
    return { success: false, error: 'Payment account details are required', field: 'paymentAccountData' };
  }

  const paymentMethod = await prisma.paymentMethodDefinition.findUnique({ where: { id: input.paymentMethodId } });
  if (!paymentMethod || paymentMethod.tenantId !== invitation.tenantId || !paymentMethod.isActive) {
    return { success: false, error: 'Payment method not found', field: 'paymentMethodId' };
  }

  const existingUser = await prisma.user.findUnique({ where: { email: invitation.email } });
  if (existingUser) {
    return { success: false, error: 'An account with this email already exists' };
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: invitation.tenantId } });

  // Payroll v2: their tax ID, when it's asked (see taxIdAsked) — required in AR/US for employees.
  const taxIdAsk = await taxIdAsked(tenant, employee.id, employee.personType);
  const taxIdRaw = (input.taxId ?? '').trim();
  const taxIdError = checkSigningTaxId(taxIdAsk, taxIdRaw);
  if (taxIdError) return { success: false, error: taxIdError, field: 'taxId' };

  // Same guard as invitationService.ts's acceptInvitation — confirming a contract creates a new
  // active seat too. Checked before the (fairly expensive) PDF render below.
  const capError = await seatCapError(tenant);
  if (capError) {
    return { success: false, error: capError };
  }

  const encryptedAccountData = encryptPaymentAccountData(input.paymentAccountData.trim());
  const confirmedAt = new Date();
  const signedPdfBuffer = await renderSignedContractPdf(tenant, employee, compensation, confirmedAt, input.ip);

  const result = await prisma.$transaction(async (tx) => {
    // Read separately rather than added to findInvitationByToken's select — that helper also backs
    // the public GET /api/invitations/:token, which returns its result as-is.
    const { roleId } = await tx.invitation.findUniqueOrThrow({ where: { token: input.token }, select: { roleId: true } });

    const user = await tx.user.create({
      data: {
        // Name comes from Employee, not re-collected here — "Persona" is a
        // read-only field on this screen, the owner already entered it.
        firstName: employee.firstName,
        lastName: employee.lastName,
        phone: input.phone.trim(),
        email: invitation.email,
        emailDomain: getEmailDomain(invitation.email),
        passwordHash: hashPassword(input.password),
        role: invitation.role,
        // Same as invitationService.ts's acceptInvitation — roleId is what resolveRoleContextForUser
        // actually reads. Was missing here, so a contract-confirmed User always fell back to the
        // seed role matching the `role` enum (Member), whatever role the invitation carried.
        roleId,
        tenantId: invitation.tenantId,
        acceptedTermsAt: new Date(),
      },
    });

    await tx.employee.update({
      where: { id: employee.id },
      data: { userId: user.id, countryOfResidence: input.countryOfResidence.trim() },
    });

    await tx.employeeCompensation.update({
      where: { id: compensation.id },
      data: {
        paymentMethodId: paymentMethod.id,
        paymentAccountSubType: input.paymentAccountSubType ?? null,
        paymentAccountDataEncrypted: encryptedAccountData,
        confirmedAt,
        confirmedIp: input.ip,
        contractPdf: signedPdfBuffer,
      },
    });

    await tx.invitation.update({
      where: { token: input.token },
      data: { status: 'accepted' },
    });

    const session = await tx.session.create({
      data: {
        token: randomUUID(),
        userId: user.id,
        expiresAt: newSessionExpiry(),
      },
    });

    return { user, session };
  }, { timeout: 15000 });

  // A newly-confirmed contract is a new active seat, same as invitationService.ts's
  // acceptInvitation — this path never called it before (gap found alongside the seat-cap check
  // added above), so a Payroll contract confirmation was never actually billing for the seat it
  // creates once a tenant is on a real (non-free-trial) plan.
  await bestEffort(syncSeatBilling(invitation.tenantId), `syncSeatBilling(${invitation.tenantId})`);

  // Best-effort (same reasoning as the invitation email in invitationService.ts) — the contract
  // is already confirmed and stored either way, so a failed email here shouldn't fail a request
  // the user is waiting on to get logged in. sendContractSignedEmail already swallows its own
  // errors (see mailer.ts's dispatchMail), but this must still be awaited, not fired-and-forgotten
  // — an un-awaited promise can be killed mid-flight by Vercel once the HTTP response is sent
  // (confirmed 2026-08-25 with signup verification emails; this call site had the same gap).
  await sendSignedContractCopy({
    tenantId: invitation.tenantId,
    tenantName: tenant.name,
    signer: result.user,
    employee,
    createdByUserId: compensation.createdByUserId,
    pdfBuffer: signedPdfBuffer,
  });

  if (taxIdAsk && taxIdRaw) await setEmployeeTaxId(tenant.id, employee.id, taxIdRaw, result.user.id);

  return { success: true, user: result.user, session: result.session };
}
