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
import { TENANT_SUMMARY_SELECT, type TenantSummary } from './tenantSummary.js';
import { seedDefaultStatusDefinitions } from '../hr/statusService.js';
import { seedDefaultPipelines } from '../crm/pipelineService.js';
import { seedDefaultPayFrequencies } from '../hr/payFrequencyService.js';
import { seedDefaultPaymentMethods } from '../hr/paymentMethodService.js';
import { getEmailDomain } from '../../lib/email.js';
import { CURRENT_PLAN_PRICES_CENTS } from './planService.js';
import { recordActivity } from '../activity/activityLogService.js';
import { tenantActivityFieldConfig } from '../activity/fieldConfigs/tenantFieldConfig.js';

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

export interface DomainCheckResult {
  blocked: boolean;
  error?: string;
}

// Shared by registerTenantWithOwner (defense in depth, at final submit) and
// signup/start + /resend (the real gate, before an EmailVerification is even created) — see
// spec-tenant-signup.md. Extracted 2026-08 from what used to be inline-only in
// registerTenantWithOwner, so the check doesn't diverge between the two call sites.
//
// `cancelled` and `suspended` tenants are excluded from the match (previously only `active`
// was checked) — a company that left, or whose lapsed trial auto-suspended with no self-serve
// way back (no billing provider is integrated yet), shouldn't permanently block a new signup
// from the same domain. `trialing`/`past_due` tenants (added alongside Subscription Plans) are
// real, current tenants that should block a duplicate exactly like `active` already did.
export async function checkEmailDomainNotAlreadyRegistered(email: string): Promise<DomainCheckResult> {
  const emailDomain = getEmailDomain(email);
  if (!emailDomain || GENERIC_EMAIL_DOMAINS.has(emailDomain)) {
    return { blocked: false };
  }

  // OR'd with a fallback endsWith scan for emailDomain: null rows — every user created before
  // this column existed has no emailDomain until scripts/backfill-user-email-domain.ts is run
  // for its environment; without the fallback, the equality match silently never sees those
  // rows and a duplicate-domain signup that should be blocked goes through instead. The
  // fallback only scans null rows (not the whole table), so it stays cheap once backfilled.
  const domainAlreadyRegistered = await prisma.user.findFirst({
    where: {
      OR: [{ emailDomain }, { emailDomain: null, email: { endsWith: `@${emailDomain}` } }],
      tenant: { status: { notIn: ['cancelled', 'suspended'] } },
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
        name: input.tenantName.trim(),
        slug,
        companySize: input.companySize,
        industry: input.industry.trim(),
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

    // Billing Integration (spec-billing-integration.md, Unidad 2) — every tenant gets a
    // Subscription from the moment it's created, not just backfilled for pre-existing ones.
    // plan/lockedPriceCents start as the same 'starter' placeholder the backfill script uses for
    // tenants with no chosen plan (schema.prisma's comment on the Subscription model);
    // updateTenantPlan (planService.ts) overwrites it the moment the owner actually picks one.
    await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        plan: 'starter',
        status: 'trialing',
        lockedPriceCents: CURRENT_PLAN_PRICES_CENTS.starter,
        currency: 'USD',
        trialEndsAt: tenant.trialEndsAt,
      },
    });

    const user = await tx.user.create({
      data: {
        firstName: input.ownerFirstName,
        lastName: input.ownerLastName,
        phone: input.ownerPhone.trim(),
        email: normalizedEmail,
        emailDomain: getEmailDomain(normalizedEmail),
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
    select: TENANT_SUMMARY_SELECT,
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
  tenant?: TenantSummary;
  error?: string;
}

export async function updateTenantCurrency(
  tenantId: string,
  currency: string,
  changedByUserId: string,
): Promise<UpdateTenantCurrencyResult> {
  if (!Intl.supportedValuesOf('currency').includes(currency)) {
    return { success: false, error: 'Invalid currency code' };
  }

  const existing = await prisma.tenant.findUnique({ where: { id: tenantId }, select: TENANT_SUMMARY_SELECT });
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: { currency },
    select: TENANT_SUMMARY_SELECT,
  });

  await recordActivity({
    tenantId,
    entityType: 'tenant',
    entityId: tenantId,
    entityLabel: tenant.name,
    action: 'update',
    changedByUserId,
    before: existing,
    after: tenant,
    fieldConfig: tenantActivityFieldConfig,
  });

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

  // Atomic consume — re-checks verifiedAt at delete time instead of trusting the read above, so
  // two concurrent submits of the same verified email (double-click, client retry) can't both
  // pass validation and create two tenants: only one deleteMany actually removes the row, the
  // loser gets count 0 and a clean error instead of racing into tenant creation.
  const consumed = await prisma.emailVerification.deleteMany({
    where: { id: record.id, verifiedAt: { not: null } },
  });
  if (consumed.count === 0) {
    return { valid: false, error: 'This verification link is invalid. Please start over.' };
  }

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
