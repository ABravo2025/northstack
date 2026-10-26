import { beforeEach, describe, expect, it, vi } from 'vitest';

// Contracts tab (grouping of a person's contract history) and My contract (signing a first
// contract while logged in) — employeeContractsService.ts.

const DAY = 86_400_000;
let rows: any[] = [];
let unsigned: any = null;
let updateManyCount = 1;

vi.mock('../src/lib/prisma.js', () => {
  const client: any = {
    employee: {
      findUnique: vi.fn(async ({ where }: any) =>
        where.userId
          ? { id: 'emp-1', tenantId: 't-1', firstName: 'Ana', lastName: 'Paz', nationality: null, countryOfResidence: null, timeOffPolicies: [] }
          : { tenantId: 't-1' },
      ),
      update: vi.fn(async () => ({})),
    },
    employeeCompensation: {
      findMany: vi.fn(async ({ where }: any) => (where.contractPdf ? rows.filter((r) => r.hasPdf).map((r) => ({ id: r.id })) : rows)),
      findFirst: vi.fn(async () => unsigned),
      updateMany: vi.fn(async () => ({ count: updateManyCount })),
    },
    paymentMethodDefinition: { findUnique: vi.fn(async () => ({ id: 'pm-1', tenantId: 't-1', isActive: true })) },
    tenant: { findUniqueOrThrow: vi.fn(async () => ({ id: 't-1', name: 'Acme' })) },
    user: { findUniqueOrThrow: vi.fn(async () => ({ id: 'u-ana', email: 'ana@acme.com', locale: 'en' })) },
  };
  client.$transaction = vi.fn(async (fn: any) => fn(client));
  return { default: client };
});
vi.mock('../src/lib/encryption.js', () => ({ encryptPaymentAccountData: vi.fn(() => 'enc') }));
vi.mock('../src/modules/hr/employeeTaxIdService.js', () => ({ setEmployeeTaxId: vi.fn(async () => ({ success: true })) }));
vi.mock('../src/modules/hr/contractConfirmationService.js', () => ({
  taxIdAsked: vi.fn(async () => null),
  checkSigningTaxId: vi.fn(() => null),
  listSigningPaymentMethods: vi.fn(async () => []),
  renderSignedContractPdf: vi.fn(async () => Buffer.from([1])),
  sendSignedContractCopy: vi.fn(async () => {}),
}));

import { confirmMyContract, listEmployeeContracts } from '../src/modules/hr/employeeContractsService.js';
import { sendSignedContractCopy } from '../src/modules/hr/contractConfirmationService.js';

function row(over: Partial<any>) {
  return {
    id: 'c',
    compensationType: 'fixed',
    rateCents: 100000,
    currency: 'USD',
    jobTitle: 'Dev',
    description: 'Builds',
    effectiveFrom: new Date(Date.now() - 30 * DAY),
    effectiveTo: null,
    note: null,
    confirmedAt: null,
    confirmedIp: null,
    blocksParticipation: false,
    createdAt: new Date(Date.now() - 30 * DAY),
    payFrequency: { name: 'Monthly' },
    paymentMethod: null,
    createdBy: { firstName: 'Owner', lastName: 'One' },
    hasPdf: true,
    ...over,
  };
}

describe('listEmployeeContracts — grouping', () => {
  it('groups signed first contract as ended, the raise as active, and a future one as upcoming', async () => {
    rows = [
      row({ id: 'future', effectiveFrom: new Date(Date.now() + 10 * DAY), createdAt: new Date() }),
      row({ id: 'raise', effectiveTo: new Date(Date.now() + 9 * DAY), createdAt: new Date(Date.now() - 5 * DAY) }),
      row({ id: 'first', blocksParticipation: true, confirmedAt: new Date(Date.now() - 60 * DAY), effectiveTo: new Date(Date.now() - 6 * DAY), createdAt: new Date(Date.now() - 61 * DAY) }),
    ];
    const { contracts } = await listEmployeeContracts('t-1', 'emp-1');
    const byId = Object.fromEntries(contracts!.map((c) => [c.id, c]));
    expect(byId.first).toMatchObject({ group: 'ended', signature: 'signed' });
    expect(byId.raise).toMatchObject({ group: 'active', signature: 'not_required' });
    expect(byId.future).toMatchObject({ group: 'upcoming', isCurrent: true });
  });

  it('puts an unsigned first contract under pending signature, overdue after 3 days', async () => {
    rows = [row({ id: 'first', blocksParticipation: true, createdAt: new Date(Date.now() - 4 * DAY) })];
    const { contracts } = await listEmployeeContracts('t-1', 'emp-1');
    expect(contracts![0]).toMatchObject({ group: 'pending_signature', signature: 'overdue' });
  });
});

describe('confirmMyContract', () => {
  const input = {
    userId: 'u-ana',
    tenantId: 't-1',
    compensationId: 'first',
    countryOfResidence: 'Argentina',
    paymentMethodId: 'pm-1',
    paymentAccountData: 'ana.mp',
    acceptedContract: true,
    ip: '1.2.3.4',
  };

  beforeEach(() => {
    unsigned = { id: 'first', createdByUserId: 'u-owner', payFrequency: { name: 'Monthly' } };
    updateManyCount = 1;
    vi.mocked(sendSignedContractCopy).mockClear();
  });

  it('signs and sends the signed copy', async () => {
    expect(await confirmMyContract(input)).toEqual({ success: true });
    expect(sendSignedContractCopy).toHaveBeenCalledTimes(1);
  });

  it('refuses when the contract read is not the one waiting for signature', async () => {
    const result = await confirmMyContract({ ...input, compensationId: 'other' });
    expect(result.success).toBe(false);
  });

  it('refuses a double submit without sending a second copy', async () => {
    updateManyCount = 0;
    const result = await confirmMyContract(input);
    expect(result.success).toBe(false);
    expect(sendSignedContractCopy).not.toHaveBeenCalled();
  });

  it('requires accepting the contract', async () => {
    const result = await confirmMyContract({ ...input, acceptedContract: false });
    expect(result).toMatchObject({ success: false, field: 'acceptedContract' });
  });
});
