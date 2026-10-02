import { beforeEach, describe, expect, it, vi } from 'vitest';

// createCompensation's first-ever-contract path sends the contract-confirmation invitation — this
// checks the platform role chosen in the Add Person form actually reaches that invitation, and that
// leaving it out keeps the previous fixed Member behavior (no roleId → createInvitation's default).

const employee = { id: 'emp-1', tenantId: 't-1', firstName: 'Ana', lastName: 'Paz', email: 'ana@acme.com', nationality: null, userId: null as string | null };
let existingCompensations = 0;

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    employee: { findUnique: vi.fn(async () => employee) },
    employeeCompensation: {
      count: vi.fn(async () => existingCompensations),
      findFirst: vi.fn(async () => null),
      update: vi.fn(),
      create: vi.fn(async ({ data }: any) => ({ id: 'comp-1', ...data })),
    },
    tenant: { findUniqueOrThrow: vi.fn(async () => ({ id: 't-1', name: 'Acme' })) },
    payFrequencyDefinition: { findUniqueOrThrow: vi.fn(async () => ({ id: 'pf-1', name: 'Monthly' })) },
  },
}));
vi.mock('../src/modules/tenant/invitationService.js', () => ({
  createInvitation: vi.fn(async () => ({ success: true, invitation: { token: 'tok' } })),
}));
vi.mock('../src/modules/hr/contractPdfService.js', () => ({ renderContractPdf: vi.fn(async () => new Uint8Array([1])) }));
vi.mock('../src/modules/tenant/tenantProfileService.js', () => ({ toTenantBranding: vi.fn(() => ({})) }));
vi.mock('../src/modules/activity/activityLogService.js', () => ({ recordActivity: vi.fn(async () => {}) }));

import { createCompensation } from '../src/modules/hr/employeeCompensationService.js';
import { createInvitation } from '../src/modules/tenant/invitationService.js';

const baseInput = {
  tenantId: 't-1',
  employeeId: 'emp-1',
  compensationType: 'fixed' as const,
  rateCents: 100000,
  currency: 'USD',
  payFrequencyId: 'pf-1',
  jobTitle: 'Dev',
  description: 'Builds things',
  effectiveFrom: '2026-10-01',
  createdByUserId: 'u-owner',
};

describe('createCompensation — contract-confirmation invitation role', () => {
  beforeEach(() => {
    vi.mocked(createInvitation).mockClear();
    existingCompensations = 0;
    employee.userId = null;
  });

  it('passes the role chosen at alta onto the invitation', async () => {
    const result = await createCompensation({ ...baseInput, inviteRoleId: 'role-admin' });
    expect(result.success).toBe(true);
    expect(createInvitation).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createInvitation).mock.calls[0][0]).toMatchObject({ roleId: 'role-admin', acceptPath: '/confirm-contract' });
  });

  it('falls back to the default (no roleId) when none is chosen', async () => {
    await createCompensation(baseInput);
    expect(vi.mocked(createInvitation).mock.calls[0][0].roleId).toBeUndefined();
  });

  it('does not invite on a later contract (raise/reassignment)', async () => {
    existingCompensations = 1;
    await createCompensation({ ...baseInput, inviteRoleId: 'role-admin' });
    expect(createInvitation).not.toHaveBeenCalled();
  });
});
