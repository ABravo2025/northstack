import { beforeEach, describe, expect, it, vi } from 'vitest';

const users: any[] = [];
const emailVerifications: any[] = [];
const tenants: any[] = [];

vi.mock('../src/modules/hr/statusService.js', () => ({
  seedDefaultStatusDefinitions: vi.fn(async () => {}),
}));
vi.mock('../src/modules/crm/pipelineService.js', () => ({
  seedDefaultPipelines: vi.fn(async () => {}),
}));
vi.mock('../src/modules/hr/payFrequencyService.js', () => ({
  seedDefaultPayFrequencies: vi.fn(async () => {}),
}));
vi.mock('../src/modules/hr/paymentMethodService.js', () => ({
  seedDefaultPaymentMethods: vi.fn(async () => {}),
}));

vi.mock('../src/lib/prisma.js', () => {
  const mockPrisma: any = {
    user: {
      findUnique: vi.fn(async ({ where }: any) => users.find((u) => u.email === where.email) ?? null),
      // Domain derived from each fixture's `.email` rather than requiring an `.emailDomain`
      // field on every test's pushed user — mirrors what the real column holds without
      // needing every existing fixture updated. A fixture that explicitly sets `emailDomain`
      // (including `null`, to simulate a pre-backfill legacy row) has that value used as-is
      // instead, so the OR-fallback branch below has something real to exercise.
      findFirst: vi.fn(async ({ where }: any) => {
        const excludedStatuses: string[] = where.tenant?.status?.notIn ?? [];
        const conditions: any[] = where.OR ?? [where];
        return (
          users.find((u) => {
            if (!u.tenantStatus || excludedStatuses.includes(u.tenantStatus)) return false;
            const storedDomain = 'emailDomain' in u ? u.emailDomain : u.email.split('@')[1]?.toLowerCase();
            return conditions.some((cond) => {
              if (cond.emailDomain === null) {
                const suffix = cond.email?.endsWith as string | undefined;
                return storedDomain === null && !!suffix && u.email.toLowerCase().endsWith(suffix.toLowerCase());
              }
              return storedDomain === cond.emailDomain;
            });
          }) ?? null
        );
      }),
      create: vi.fn(async ({ data }: any) => {
        const user = { id: `user-${users.length + 1}`, ...data };
        users.push(user);
        return user;
      }),
    },
    tenant: {
      findUnique: vi.fn(async ({ where }: any) => tenants.find((t) => t.slug === where.slug) ?? null),
      create: vi.fn(async ({ data }: any) => {
        const tenant = { id: `tenant-${tenants.length + 1}`, ...data };
        tenants.push(tenant);
        return tenant;
      }),
    },
    session: {
      create: vi.fn(async ({ data }: any) => ({ id: `session-${Math.random()}`, createdAt: new Date(), ...data })),
    },
    statusDefinition: {
      findFirstOrThrow: vi.fn(async () => ({ id: 'status-default' })),
    },
    employee: {
      create: vi.fn(async () => ({})),
    },
    // Billing Integration — registerTenantWithOwner now creates a placeholder Subscription
    // alongside the Tenant in the same transaction (see tenantService.ts).
    subscription: {
      create: vi.fn(async ({ data }: any) => ({ id: `subscription-${Math.random()}`, ...data })),
    },
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
    emailVerification: {
      findUnique: vi.fn(
        async ({ where }: any) => emailVerifications.find((e) => e.token === where.token || e.id === where.id) ?? null,
      ),
      create: vi.fn(async ({ data }: any) => {
        const record = { id: `ev-${emailVerifications.length + 1}`, verifiedAt: null, createdAt: new Date(), ...data };
        emailVerifications.push(record);
        return record;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const record = emailVerifications.find((e) => e.id === where.id);
        Object.assign(record, data);
        return record;
      }),
      delete: vi.fn(async ({ where }: any) => {
        const index = emailVerifications.findIndex((e) => e.id === where.id);
        const [removed] = emailVerifications.splice(index, 1);
        return removed;
      }),
      // Matches on whichever subset of {email, id, verifiedAt} the caller passed — real callers
      // are startSignupVerification ({email}, invalidate-on-resend) and
      // validateAndConsumeEmailVerification ({id, verifiedAt: {not: null}}, atomic consume).
      deleteMany: vi.fn(async ({ where }: any) => {
        const before = emailVerifications.length;
        for (let i = emailVerifications.length - 1; i >= 0; i -= 1) {
          const record = emailVerifications[i];
          let matches = true;
          if (where.email !== undefined && record.email !== where.email) matches = false;
          if (where.id !== undefined && record.id !== where.id) matches = false;
          if (where.verifiedAt === null && record.verifiedAt !== null) matches = false;
          if (where.verifiedAt?.not === null && record.verifiedAt === null) matches = false;
          if (matches) emailVerifications.splice(i, 1);
        }
        return { count: before - emailVerifications.length };
      }),
    },
  };
  return { default: mockPrisma };
});

vi.mock('../src/lib/mailer.js', () => ({
  sendSignupVerificationEmail: vi.fn(async () => {}),
}));

import {
  startSignupVerification,
  verifySignupToken,
} from '../src/modules/tenant/emailVerificationService.js';
import { checkEmailDomainNotAlreadyRegistered, registerTenantWithOwner } from '../src/modules/tenant/tenantService.js';

const validPersonFields = {
  tenantName: 'Acme Inc',
  ownerFirstName: 'Alice',
  ownerLastName: 'Smith',
  ownerEmail: 'alice@acme.com',
  ownerPassword: 'StrongPassword123!',
  ownerPhone: '+1-555-0100',
  acceptedTerms: true,
  companySize: '1-10',
  industry: 'Software',
  country: 'United States',
};

describe('emailVerificationService', () => {
  beforeEach(() => {
    users.length = 0;
    emailVerifications.length = 0;
    tenants.length = 0;
  });

  it('rejects a malformed email before creating a verification row', async () => {
    const result = await startSignupVerification('not-an-email');
    expect(result.success).toBe(false);
    expect(result.field).toBe('email');
    expect(emailVerifications).toHaveLength(0);
  });

  it('rejects an email that already belongs to a registered user', async () => {
    users.push({ id: 'u1', email: 'taken@acme.com', tenantStatus: 'active' });
    const result = await startSignupVerification('taken@acme.com');
    expect(result.success).toBe(false);
    expect(result.field).toBe('email');
  });

  it('rejects a domain already registered by an active tenant, but allows generic providers through', async () => {
    users.push({ id: 'u1', email: 'existing@acme.com', tenantStatus: 'active' });

    const blocked = await startSignupVerification('newperson@acme.com');
    expect(blocked.success).toBe(false);
    expect(blocked.field).toBe('email');

    const allowed = await startSignupVerification('someone@gmail.com');
    expect(allowed.success).toBe(true);
  });

  it('creates a verification row and supersedes an earlier unverified one for the same email', async () => {
    const first = await startSignupVerification('alice@acme.com');
    expect(first.success).toBe(true);
    expect(emailVerifications).toHaveLength(1);
    const firstToken = emailVerifications[0].token;

    const second = await startSignupVerification('alice@acme.com');
    expect(second.success).toBe(true);
    expect(emailVerifications).toHaveLength(1);
    expect(emailVerifications[0].token).not.toBe(firstToken);
  });

  it('resend also invalidates a link that was already clicked but never consumed', async () => {
    await startSignupVerification('alice@acme.com');
    const firstToken = emailVerifications[0].token;
    await verifySignupToken(firstToken); // clicks it — verifiedAt is now set, tenant never created

    const resend = await startSignupVerification('alice@acme.com');
    expect(resend.success).toBe(true);
    // Only the fresh row survives — the previously-clicked one is gone, so a stale forwarded
    // copy of the first link can no longer complete registration.
    expect(emailVerifications).toHaveLength(1);
    expect(emailVerifications[0].token).not.toBe(firstToken);
  });

  it('verifies a fresh token and is idempotent on a second call', async () => {
    await startSignupVerification('alice@acme.com');
    const token = emailVerifications[0].token;

    const first = await verifySignupToken(token);
    expect(first.success).toBe(true);
    expect(first.email).toBe('alice@acme.com');
    expect(emailVerifications[0].verifiedAt).toBeInstanceOf(Date);

    const second = await verifySignupToken(token);
    expect(second.success).toBe(true);
    expect(second.email).toBe('alice@acme.com');
  });

  it('rejects an unknown token with 404 and an expired token with 410', async () => {
    const missing = await verifySignupToken('does-not-exist');
    expect(missing.success).toBe(false);
    expect(missing.status).toBe(404);

    emailVerifications.push({
      id: 'ev-expired',
      email: 'bob@acme.com',
      token: 'expired-token',
      expiresAt: new Date(Date.now() - 1000),
      verifiedAt: null,
      createdAt: new Date(),
    });
    const expired = await verifySignupToken('expired-token');
    expect(expired.success).toBe(false);
    expect(expired.status).toBe(410);
  });

  it('reports expired (410) even for a link that was already clicked, not stale success', async () => {
    emailVerifications.push({
      id: 'ev-clicked-then-expired',
      email: 'carol@acme.com',
      token: 'clicked-expired-token',
      expiresAt: new Date(Date.now() - 1000),
      verifiedAt: new Date(Date.now() - 2000), // clicked before it expired, never consumed since
      createdAt: new Date(),
    });
    const result = await verifySignupToken('clicked-expired-token');
    expect(result.success).toBe(false);
    expect(result.status).toBe(410);
  });
});

describe('checkEmailDomainNotAlreadyRegistered', () => {
  beforeEach(() => {
    users.length = 0;
  });

  it('excludes cancelled tenants from the block, but not trialing/past_due ones', async () => {
    users.push({ id: 'u1', email: 'owner@acme.com', tenantStatus: 'cancelled' });
    const afterCancelled = await checkEmailDomainNotAlreadyRegistered('new@acme.com');
    expect(afterCancelled.blocked).toBe(false);

    users.push({ id: 'u2', email: 'owner2@acme.com', tenantStatus: 'trialing' });
    const afterTrialing = await checkEmailDomainNotAlreadyRegistered('new@acme.com');
    expect(afterTrialing.blocked).toBe(true);
  });

  it('excludes suspended tenants from the block too — a lapsed trial should not permanently lock the domain', async () => {
    users.push({ id: 'u1', email: 'owner@acme.com', tenantStatus: 'suspended' });
    const result = await checkEmailDomainNotAlreadyRegistered('new@acme.com');
    expect(result.blocked).toBe(false);
  });

  it('still blocks a legacy user whose emailDomain column has not been backfilled yet (null)', async () => {
    users.push({ id: 'u1', email: 'owner@acme.com', tenantStatus: 'active', emailDomain: null });
    const result = await checkEmailDomainNotAlreadyRegistered('new@acme.com');
    expect(result.blocked).toBe(true);
  });
});

describe('registerTenantWithOwner — email verification gate', () => {
  beforeEach(() => {
    users.length = 0;
    emailVerifications.length = 0;
    tenants.length = 0;
  });

  it('rejects registration when verificationToken is missing, without creating anything', async () => {
    const result = await registerTenantWithOwner({ ...validPersonFields, verificationToken: '' });
    expect(result.success).toBe(false);
    expect(result.field).toBe('verificationToken');
    expect(tenants).toHaveLength(0);
    expect(users).toHaveLength(0);
  });

  it('rejects registration when the token was never verified', async () => {
    emailVerifications.push({
      id: 'ev-1',
      email: 'alice@acme.com',
      token: 'unverified-token',
      expiresAt: new Date(Date.now() + 60_000),
      verifiedAt: null,
      createdAt: new Date(),
    });

    const result = await registerTenantWithOwner({ ...validPersonFields, verificationToken: 'unverified-token' });
    expect(result.success).toBe(false);
    expect(result.field).toBe('verificationToken');
    // Not consumed — the person can still go back and click the email link.
    expect(emailVerifications).toHaveLength(1);
  });

  it('rejects registration when the verified token belongs to a different email', async () => {
    emailVerifications.push({
      id: 'ev-2',
      email: 'someone-else@acme.com',
      token: 'mismatched-token',
      expiresAt: new Date(Date.now() + 60_000),
      verifiedAt: new Date(),
      createdAt: new Date(),
    });

    const result = await registerTenantWithOwner({ ...validPersonFields, verificationToken: 'mismatched-token' });
    expect(result.success).toBe(false);
    expect(result.field).toBe('verificationToken');
  });

  it('does not consume the token if the tenant name is already taken', async () => {
    tenants.push({ id: 't1', slug: 'acme-inc' });
    emailVerifications.push({
      id: 'ev-3',
      email: 'alice@acme.com',
      token: 'valid-token',
      expiresAt: new Date(Date.now() + 60_000),
      verifiedAt: new Date(),
      createdAt: new Date(),
    });

    const result = await registerTenantWithOwner({ ...validPersonFields, verificationToken: 'valid-token' });
    expect(result.success).toBe(false);
    expect(result.field).toBe('tenantName');
    // Still there — burning the token on an unrelated failure would force a full restart of
    // the verification flow just to fix the tenant name.
    expect(emailVerifications).toHaveLength(1);
  });

  it('requires companySize/industry/country before ever checking the token', async () => {
    const result = await registerTenantWithOwner({ ...validPersonFields, industry: '', verificationToken: 'whatever' });
    expect(result.success).toBe(false);
    expect(result.field).toBe('industry');
  });

  it('the same verified token cannot be consumed twice, even once the earlier duplicate-email guard is out of the way', async () => {
    emailVerifications.push({
      id: 'ev-race',
      email: 'alice@acme.com',
      token: 'race-token',
      expiresAt: new Date(Date.now() + 60_000),
      verifiedAt: new Date(),
      createdAt: new Date(),
    });

    const first = await registerTenantWithOwner({ ...validPersonFields, verificationToken: 'race-token' });
    expect(first.success).toBe(true);
    expect(tenants).toHaveLength(1);
    expect(emailVerifications).toHaveLength(0); // consumed

    // A real race is two requests reading "email not registered yet" before either commits, so
    // the second one reaches token consumption instead of being turned away earlier by the
    // existingUser check. This mock is sequential, so that earlier guard can't be bypassed the
    // same way — clearing `users` reproduces the same effect: the point under test is that
    // validateAndConsumeEmailVerification's atomic deleteMany, not an earlier guard, is what
    // stops a second tenant from being created off the same token.
    users.length = 0;

    const second = await registerTenantWithOwner({
      ...validPersonFields,
      tenantName: 'Acme Inc 2',
      verificationToken: 'race-token',
    });
    expect(second.success).toBe(false);
    expect(second.field).toBe('verificationToken');
    expect(tenants).toHaveLength(1);
  });
});
