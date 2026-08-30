import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    user: { findUnique: vi.fn() },
    employee: { findUnique: vi.fn() },
    statusDefinition: { findUnique: vi.fn() },
    fieldCatalogDefinition: { findUnique: vi.fn() },
    company: { findUnique: vi.fn() },
    pipeline: { findUnique: vi.fn() },
    pipelineStageDefinition: { findUnique: vi.fn() },
  },
}));

const { recordActivityMock } = vi.hoisted(() => ({ recordActivityMock: vi.fn() }));
vi.mock('../src/modules/activity/activityLogService.js', () => ({
  recordActivity: recordActivityMock,
}));

import prisma from '../src/lib/prisma.js';
import {
  resolveCatalogName,
  resolveCompanyName,
  resolveEmployeeName,
  resolveMoney,
  resolvePipelineName,
  resolveStageName,
  resolveUserName,
} from '../src/modules/activity/fieldConfigs/resolvers.js';
import { employeeActivityFieldConfig, employeeDisplayName } from '../src/modules/activity/fieldConfigs/employeeFieldConfig.js';
import { companyActivityFieldConfig } from '../src/modules/activity/fieldConfigs/companyFieldConfig.js';
import { contactActivityFieldConfig, contactDisplayName } from '../src/modules/activity/fieldConfigs/contactFieldConfig.js';
import { opportunityActivityFieldConfig } from '../src/modules/activity/fieldConfigs/opportunityFieldConfig.js';
import { recordCustomFieldValueActivity } from '../src/modules/activity/customFieldActivity.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveMoney', () => {
  it('formats cents as currency using the sibling currency field', () => {
    expect(resolveMoney(1000000, { currency: 'USD' })).toBe('$10,000.00');
    expect(resolveMoney(50, { currency: 'ARS' })).toContain('0.50');
  });

  it('falls back to USD when the record has no currency', () => {
    expect(resolveMoney(100, {})).toBe('$1.00');
  });

  it('returns null for a non-number value', () => {
    expect(resolveMoney(null, { currency: 'USD' })).toBeNull();
    expect(resolveMoney(undefined, { currency: 'USD' })).toBeNull();
  });
});

describe('FK name resolvers', () => {
  it('resolveUserName looks up first+last name', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ firstName: 'Jane', lastName: 'Smith' } as any);
    expect(await resolveUserName('u1')).toBe('Jane Smith');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' }, select: { firstName: true, lastName: true } });
  });

  it('resolveEmployeeName looks up first+last name (self-referential manager case)', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce({ firstName: 'Bob', lastName: 'Manager' } as any);
    expect(await resolveEmployeeName('e1')).toBe('Bob Manager');
  });

  it('resolveStatusName/resolveCatalogName/resolveCompanyName/resolvePipelineName/resolveStageName return null when not found', async () => {
    vi.mocked(prisma.fieldCatalogDefinition.findUnique).mockResolvedValueOnce(null);
    expect(await resolveCatalogName('missing')).toBeNull();
    vi.mocked(prisma.company.findUnique).mockResolvedValueOnce(null);
    expect(await resolveCompanyName('missing')).toBeNull();
    vi.mocked(prisma.pipeline.findUnique).mockResolvedValueOnce(null);
    expect(await resolvePipelineName('missing')).toBeNull();
    vi.mocked(prisma.pipelineStageDefinition.findUnique).mockResolvedValueOnce(null);
    expect(await resolveStageName('missing')).toBeNull();
  });

  it('every resolver short-circuits to null for a non-string id (defensive against a bad raw value)', async () => {
    expect(await resolveUserName(42)).toBeNull();
    expect(await resolveEmployeeName(null)).toBeNull();
    expect(await resolveCatalogName(undefined)).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('field config maps', () => {
  it('employeeActivityFieldConfig resolves managerId through resolveEmployeeName, not employeeService (no import cycle)', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce({ firstName: 'A', lastName: 'B' } as any);
    const label = await employeeActivityFieldConfig.managerId.resolve!('m1', {});
    expect(label).toBe('A B');
  });

  it('employeeDisplayName / contactDisplayName join first+last name', () => {
    expect(employeeDisplayName({ firstName: 'Jane', lastName: 'Doe' })).toBe('Jane Doe');
    expect(contactDisplayName({ firstName: 'John', lastName: 'Roe' })).toBe('John Roe');
  });

  it('companyActivityFieldConfig does not track statusId or isPlaceholder (deliberately excluded)', () => {
    expect(companyActivityFieldConfig.statusId).toBeUndefined();
    expect(companyActivityFieldConfig.isPlaceholder).toBeUndefined();
    expect(companyActivityFieldConfig.name).toBeDefined();
  });

  it('contactActivityFieldConfig does not track isActive (deactivation is logged as a delete action instead)', () => {
    expect(contactActivityFieldConfig.isActive).toBeUndefined();
  });

  it('opportunityActivityFieldConfig tracks amountCents with the money resolver', async () => {
    const value = await opportunityActivityFieldConfig.amountCents.resolve!(250000, { currency: 'EUR' });
    expect(value).toContain('2,500.00');
  });
});

describe('recordCustomFieldValueActivity', () => {
  it('builds a synthetic single-field before/after record keyed by the field definition id', async () => {
    await recordCustomFieldValueActivity({
      tenantId: 't1',
      entityType: 'company' as any,
      entityId: 'c1',
      entityLabel: 'Acme Inc',
      fieldDefinitionId: 'def1',
      fieldName: 'Renewal Month',
      oldValue: 'January',
      newValue: 'March',
      changedByUserId: 'u1',
    });

    expect(recordActivityMock).toHaveBeenCalledWith({
      tenantId: 't1',
      entityType: 'company',
      entityId: 'c1',
      entityLabel: 'Acme Inc',
      action: 'update',
      changedByUserId: 'u1',
      before: { def1: 'January' },
      after: { def1: 'March' },
      fieldConfig: { def1: { label: 'Renewal Month' } },
    });
  });
});
