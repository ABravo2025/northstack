import prisma from '../../lib/prisma.js';
import {
  hashPassword,
  isPasswordValid,
  isPhoneValid,
  newSessionExpiry,
  PASSWORD_POLICY_MESSAGE,
  PHONE_POLICY_MESSAGE,
} from '../auth/authService.js';
import { randomUUID } from 'crypto';
import type { AcquisitionChannel, JobFunction, Session, Tenant, User } from '@prisma/client';
import { seedDefaultStatusDefinitions } from '../hr/statusService.js';
import { seedDefaultPipelines } from '../crm/pipelineService.js';
import { seedDefaultPayFrequencies } from '../hr/payFrequencyService.js';
import { seedDefaultPaymentMethods } from '../hr/paymentMethodService.js';

// Personal/free email providers are excluded from the duplicate-domain check below —
// otherwise the first person to register with @gmail.com would block every other
// Gmail user from ever creating a tenant. example.* is IANA's reserved documentation
// domain (RFC 2606), included here so demo/test signups aren't affected either.
export const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'gmx.com',
  'yandex.com',
  'mail.com',
  'zoho.com',
  'hey.com',
  'example.com',
  'example.org',
  'example.net',
]);

export function getEmailDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailFormatValid(email: string): boolean {
  return EMAIL_FORMAT_REGEX.test(email.trim());
}

export interface DomainCheckResult {
  blocked: boolean;
  error?: string;
}

// Shared by registerTenantWithOwner (defense in depth, at final submit) and
// signup/start + /resend (the real gate, before an EmailVerification is even created) — see
// spec-tenant-signup.md. Extracted 2026-08 from what used to be inline-only in
// registerTenantWithOwner, so the check doesn't diverge between the two call sites.
//
// `cancelled` tenants are excluded from the match (previously only `active` was checked) —
// a company that left shouldn't block a new signup from the same domain, and `trialing`/
// `past_due` tenants (added alongside Subscription Plans) are real, current tenants that
// should block a duplicate exactly like `active` already did.
export async function checkEmailDomainNotAlreadyRegistered(email: string): Promise<DomainCheckResult> {
  const emailDomain = getEmailDomain(email);
  if (!emailDomain || GENERIC_EMAIL_DOMAINS.has(emailDomain)) {
    return { blocked: false };
  }

  const domainAlreadyRegistered = await prisma.user.findFirst({
    where: {
      email: { endsWith: `@${emailDomain}` },
      tenant: { status: { not: 'cancelled' } },
    },
  });

  if (domainAlreadyRegistered) {
    return {
      blocked: true,
      error: 'A company with this email domain is already registered. Ask an admin there for an invite instead.',
    };
  }

  return { blocked: false };
}

export interface TenantCreationResult {
  success: boolean;
  tenant?: Tenant;
  user?: User;
  session?: Session;
  error?: string;
  field?: string;
}

export interface CreateTenantForUserInput {
  userId: string;
  name: string;
}

export interface RegisterTenantWithOwnerInput {
  tenantName: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerPhone: string;
  acceptedTerms?: boolean;
  // Required for new signups (spec-tenant-signup.md, Screen 3a) — the schema columns stay
  // nullable so pre-existing tenants (registered before this requirement) aren't affected.
  companySize: string;
  industry: string;
  country: string;
  acquisitionChannel?: AcquisitionChannel;
  jobFunction?: JobFunction;
  // Proof the owner's email was verified via the link sent by startSignupVerification —
  // required (spec-tenant-signup.md's "Submit final"), checked and consumed below before
  // anything is created.
  verificationToken: string;
}

// 15 days, spec-subscription-plans.md — set once at registration, independent of whether the
// owner ever picks a plan on /plans. Kept as a named constant (not inlined) so
// planTransitionService.ts's own comment about "same 15 days" has one source to point at.
export const SIGNUP_TRIAL_DAYS = 15;

export async function createTenantForUser(input: CreateTenantForUserInput): Promise<TenantCreationResult> {
  const slug = normalizeSlug(input.name);

  const existingTenant = await prisma.tenant.findUnique({
    where: { slug },
  });

  if (existingTenant) {
    return { success: false, error: 'Tenant slug already registered' };
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
  });

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  if (user.tenantId) {
    return { success: false, error: 'User already belongs to a tenant' };
  }

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.name,
        slug,
      },
    });

    await seedDefaultStatusDefinitions(tx, tenant.id);
    await seedDefaultPipelines(tx, tenant.id);
    await seedDefaultPayFrequencies(tx, tenant.id);
    await seedDefaultPaymentMethods(tx, tenant.id);

    const updatedUser = await tx.user.update({
      where: { id: input.userId },
      data: {
        tenantId: tenant.id,
        role: 'owner',
      },
    });

    const ownerDefaultStatus = await tx.statusDefinition.findFirstOrThrow({
      where: { tenantId: tenant.id, entityType: 'employee', isDefault: true },
    });

    await tx.employee.create({
      data: {
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        statusId: ownerDefaultStatus.id,
        tenantId: tenant.id,
        userId: updatedUser.id,
      },
    });

    return { tenant, user: updatedUser };
  }, { timeout: 15000 }); // default 5000ms is tight once seeding (statuses + pipelines) adds several round trips over Neon's network latency

  return {
    success: true,
    tenant: result.tenant,
    user: result.user,
  };
}

export async function registerTenantWithOwner(input: RegisterTenantWithOwnerInput): Promise<TenantCreationResult> {
  const slug = normalizeSlug(input.tenantName);
  const normalizedEmail = input.ownerEmail.toLowerCase().trim();

  if (!input.ownerPhone?.trim()) {
    return { success: false, error: 'Phone is required', field: 'ownerPhone' };
  }

  if (!isPhoneValid(input.ownerPhone)) {
    return { success: false, error: PHONE_POLICY_MESSAGE, field: 'ownerPhone' };
  }

  if (!isPasswordValid(input.ownerPassword)) {
    return { success: false, error: PASSWORD_POLICY_MESSAGE, field: 'ownerPassword' };
  }

  if (input.acceptedTerms !== true) {
    return {
      success: false,
      error: 'You must accept the Terms of Service and Privacy Policy',
      field: 'acceptedTerms',
    };
  }

  if (!input.companySize?.trim()) {
    return { success: false, error: 'Company size is required', field: 'companySize' };
  }
  if (!input.industry?.trim()) {
    return { success: false, error: 'Industry is required', field: 'industry' };
  }
  if (!input.country?.trim()) {
    return { success: false, error: 'Country is required', field: 'country' };
  }

  const existingTenant = await prisma.tenant.findUnique({
    where: { slug },
  });

  if (existingTenant) {
    return { success: false, error: 'Tenant name already registered', field: 'tenantName' };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    return { success: false, error: 'Email already registered', field: 'ownerEmail' };
  }

  // Defense in depth — the real gate already ran in startSignupVerification before this
  // email was ever allowed to reach a verification link. Re-checked here in case tenant
  // state changed between then and now (e.g. someone else from the same domain registered
  // in the meantime).
  const domainCheck = await checkEmailDomainNotAlreadyRegistered(normalizedEmail);
  if (domainCheck.blocked) {
    return { success: false, error: domainCheck.error, field: 'ownerEmail' };
  }

  // Deliberately last, right before the transaction — this is the only check that actually
  // consumes (deletes) the EmailVerification row. If it ran earlier and any of the checks
  // above then failed (tenant name taken, email taken, domain blocked), the person would be
  // stuck: their token burned for an registration attempt that never happened, forcing them
  // to restart the whole email-verification flow just to fix an unrelated field.
  const verification = await validateAndConsumeEmailVerification(input.verificationToken, normalizedEmail);
  if (!verification.valid) {
    return { success: false, error: verification.error, field: 'verificationToken' };
  }

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.tenantName,
        slug,
        companySize: input.companySize,
        industry: input.industry,
        country: input.country,
        acquisitionChannel: input.acquisitionChannel,
        status: 'trialing',
        trialEndsAt: new Date(Date.now() + SIGNUP_TRIAL_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    await seedDefaultStatusDefinitions(tx, tenant.id);
    await seedDefaultPipelines(tx, tenant.id);
    await seedDefaultPayFrequencies(tx, tenant.id);
    await seedDefaultPaymentMethods(tx, tenant.id);

    const user = await tx.user.create({
      data: {
        firstName: input.ownerFirstName,
        lastName: input.ownerLastName,
        phone: input.ownerPhone.trim(),
        email: normalizedEmail,
        passwordHash: hashPassword(input.ownerPassword),
        role: 'owner',
        tenantId: tenant.id,
        acceptedTermsAt: new Date(),
        jobFunction: input.jobFunction,
      },
    });

    const session = await tx.session.create({
      data: {
        token: randomUUID(),
        userId: user.id,
        expiresAt: newSessionExpiry(),
      },
    });

    const ownerDefaultStatus = await tx.statusDefinition.findFirstOrThrow({
      where: { tenantId: tenant.id, entityType: 'employee', isDefault: true },
    });

    await tx.employee.create({
      data: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        statusId: ownerDefaultStatus.id,
        tenantId: tenant.id,
        userId: user.id,
      },
    });

    return { tenant, user, session };
  }, { timeout: 15000 }); // default 5000ms is tight once seeding (statuses + pipelines) adds several round trips over Neon's network latency

  return {
    success: true,
    tenant: result.tenant,
    user: result.user,
    session: result.session,
  };
}

export async function findTenantNameById(tenantId: string): Promise<string | null> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  return tenant?.name ?? null;
}

export async function getTenantById(tenantId: string) {
  return prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      currency: true,
      status: true,
      plan: true,
      companySize: true,
      trialEndsAt: true,
      gracePeriodEndsAt: true,
    },
  });
}

// Unscoped by design (matches findClientById/findEmployeeById elsewhere) — the
// caller checks `tenantId` before trusting the result, e.g. validating an
// accountOwnerId/ownerId referenced in a request body belongs to the same tenant.
export async function findUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export interface UpdateTenantCurrencyResult {
  success: boolean;
  tenant?: Tenant;
  error?: string;
}

export async function updateTenantCurrency(tenantId: string, currency: string): Promise<UpdateTenantCurrencyResult> {
  if (!Intl.supportedValuesOf('currency').includes(currency)) {
    return { success: false, error: 'Invalid currency code' };
  }

  const tenant = await prisma.tenant.update({ where: { id: tenantId }, data: { currency } });
  return { success: true, tenant };
}

interface EmailVerificationCheckResult {
  valid: boolean;
  error?: string;
}

// Final-submit check for registerTenantWithOwner, not the same operation as
// emailVerificationService.ts's verifySignupToken (which only marks a link as clicked). This
// requires the link to have already been clicked (verifiedAt set), and additionally checks
// the email matches and consumes the row (deletes it) so it can never be reused for a second
// tenant — kept here rather than in emailVerificationService.ts to avoid a circular import
// (that file already depends on this one for the domain/format checks).
async function validateAndConsumeEmailVerification(token: string, email: string): Promise<EmailVerificationCheckResult> {
  if (!token?.trim()) {
    return { valid: false, error: 'Email verification is required' };
  }

  const record = await prisma.emailVerification.findUnique({ where: { token } });
  if (!record) {
    return { valid: false, error: 'This verification link is invalid. Please start over.' };
  }
  if (!record.verifiedAt) {
    return { valid: false, error: 'This email has not been verified yet.' };
  }
  if (record.expiresAt < new Date()) {
    return { valid: false, error: 'This verification link has expired. Please start over.' };
  }
  if (record.email !== email) {
    return { valid: false, error: 'This verification link does not match this email.' };
  }

  await prisma.emailVerification.delete({ where: { id: record.id } });
  return { valid: true };
}

export function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
}
