import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma.js';
import type { PaymentAccountSubType, Session, User } from '@prisma/client';
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
  paymentMethods: { id: string; name: string }[];
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
  const paymentMethods = await prisma.paymentMethodDefinition.findMany({
    where: { tenantId: invitation.tenantId, isActive: true },
    orderBy: { order: 'asc' },
  });

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
      paymentMethods: paymentMethods.map((m) => ({ id: m.id, name: m.name })),
    },
  };
}

export interface ConfirmContractInput {
  token: string;
  phone: string;
  password: string;
  countryOfResidence: string;
  paymentMethodId: string;
  paymentAccountSubType?: PaymentAccountSubType | null;
  paymentAccountData: string;
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

  const encryptedAccountData = encryptPaymentAccountData(input.paymentAccountData.trim());

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        // Name comes from Employee, not re-collected here — "Persona" is a
        // read-only field on this screen, the owner already entered it.
        firstName: employee.firstName,
        lastName: employee.lastName,
        phone: input.phone.trim(),
        email: invitation.email,
        passwordHash: hashPassword(input.password),
        role: invitation.role,
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
        confirmedAt: new Date(),
        confirmedIp: input.ip,
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

  return { success: true, user: result.user, session: result.session };
}
