import { describe, expect, it } from 'vitest';
import { canCreateHr, canManageCustomFields, canViewHr } from '../src/modules/auth/permissionService.js';

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
});
