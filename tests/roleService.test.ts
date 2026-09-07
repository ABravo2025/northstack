import { describe, expect, it } from 'vitest';
import { serializeRoleContext } from '../src/modules/auth/roleService.js';
import type { RoleContext } from '../src/modules/auth/roleService.js';

describe('serializeRoleContext (Custom Roles Fase G)', () => {
  it('converts the Set/Map internal shape into a plain, JSON-serializable object', () => {
    const role: RoleContext = {
      id: 'role-1',
      name: 'Manager',
      isOwner: false,
      permissions: new Set(['view_employee', 'manage_employee']),
      hiddenFieldsByEntity: new Map([
        ['employee' as any, new Set(['personalEmail', 'birthdate'])],
        ['company' as any, new Set(['billingAddress'])],
      ]),
    };

    const serialized = serializeRoleContext(role);

    expect(serialized).toEqual({
      id: 'role-1',
      name: 'Manager',
      isOwner: false,
      permissions: ['view_employee', 'manage_employee'],
      hiddenFields: {
        employee: ['personalEmail', 'birthdate'],
        company: ['billingAddress'],
      },
    });

    // Round-trips cleanly through JSON, unlike the raw RoleContext (Set/Map flatten to "{}").
    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
  });

  it('produces an empty permissions array and hiddenFields object for Owner (zero rows, bypasses via isOwner)', () => {
    const owner: RoleContext = {
      id: 'role-owner',
      name: 'Owner',
      isOwner: true,
      permissions: new Set(),
      hiddenFieldsByEntity: new Map(),
    };

    expect(serializeRoleContext(owner)).toEqual({
      id: 'role-owner',
      name: 'Owner',
      isOwner: true,
      permissions: [],
      hiddenFields: {},
    });
  });
});
