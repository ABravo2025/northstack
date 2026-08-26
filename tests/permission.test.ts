import { describe, expect, it } from 'vitest';
import {
  canCreateHr,
  canManageCustomFields,
  canManagePayments,
  canManagePayroll,
  canViewHr,
} from '../src/modules/auth/permissionService.js';

describe('permission service', () => {
  it('allows owner and admin to manage HR and custom fields', () => {
    expect(canViewHr('owner')).toBe(true);
    expect(canCreateHr('owner')).toBe(true);
    expect(canManageCustomFields('owner')).toBe(true);

    expect(canViewHr('admin')).toBe(true);
    expect(canCreateHr('admin')).toBe(true);
    expect(canManageCustomFields('admin')).toBe(true);
  });

  it('allows member to view HR but not manage it', () => {
    expect(canViewHr('member')).toBe(true);
    expect(canCreateHr('member')).toBe(false);
    expect(canManageCustomFields('member')).toBe(false);
  });

  it('restricts Payroll management to owner only, unlike the rest of HR', () => {
    expect(canManagePayroll('owner')).toBe(true);
    expect(canManagePayroll('admin')).toBe(false);
    expect(canManagePayroll('member')).toBe(false);
  });

  it('restricts Payments (Stripe connection + payment visibility) to owner only, same as Payroll', () => {
    expect(canManagePayments('owner')).toBe(true);
    expect(canManagePayments('admin')).toBe(false);
    expect(canManagePayments('member')).toBe(false);
  });
});
