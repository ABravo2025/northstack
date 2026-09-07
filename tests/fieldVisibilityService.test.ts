import { describe, expect, it } from 'vitest';
import { isFieldVisible, redactEntityFields, redactEntityListFields, RESTRICTABLE_FIELDS_BY_ENTITY_TYPE } from '../src/modules/auth/fieldVisibilityService.js';
import { VIEW_COMPANY, VIEW_EMPLOYEE } from '../src/modules/auth/roleService.js';
import type { RoleContext } from '../src/modules/auth/roleService.js';

function roleContext(overrides: Partial<RoleContext>): RoleContext {
  return { id: 'test-role', name: 'Test', isOwner: false, permissions: new Set(), hiddenFieldsByEntity: new Map(), ...overrides };
}

describe('fieldVisibilityService', () => {
  it('excludes the identity field(s) from the restrictable catalog', () => {
    const employeeFields = RESTRICTABLE_FIELDS_BY_ENTITY_TYPE.employee!.map((f) => f.key);
    expect(employeeFields).not.toContain('firstName');
    expect(employeeFields).not.toContain('lastName');
    expect(employeeFields).toContain('personalEmail');

    const companyFields = RESTRICTABLE_FIELDS_BY_ENTITY_TYPE.company!.map((f) => f.key);
    expect(companyFields).not.toContain('name');
    expect(companyFields).toContain('billingAddress');
  });

  it('owner sees every field regardless of any restriction', () => {
    const owner = roleContext({ isOwner: true });
    expect(isFieldVisible(owner, 'employee', 'personalEmail')).toBe(true);
  });

  it('a role without the base module permission cannot see any field of that entity', () => {
    const role = roleContext({ permissions: new Set() }); // no view_employee at all
    expect(isFieldVisible(role, 'employee', 'firstName' as any)).toBe(false);
    expect(isFieldVisible(role, 'employee', 'personalEmail')).toBe(false);
  });

  it('a role with the base module permission and no field restrictions sees everything', () => {
    const role = roleContext({ permissions: new Set([VIEW_EMPLOYEE]) });
    expect(isFieldVisible(role, 'employee', 'personalEmail')).toBe(true);
  });

  it('a role with a specific field restriction cannot see just that field', () => {
    const role = roleContext({
      permissions: new Set([VIEW_EMPLOYEE]),
      hiddenFieldsByEntity: new Map([['employee' as any, new Set(['personalEmail'])]]),
    });
    expect(isFieldVisible(role, 'employee', 'personalEmail')).toBe(false);
    expect(isFieldVisible(role, 'employee', 'birthdate')).toBe(true);
  });

  it('redactEntityFields nulls out a restricted field without deleting the key', () => {
    const role = roleContext({
      permissions: new Set([VIEW_EMPLOYEE]),
      hiddenFieldsByEntity: new Map([['employee' as any, new Set(['personalEmail'])]]),
    });
    const employee = { id: 'e1', firstName: 'Ana', personalEmail: 'ana@personal.example', birthdate: '1990-01-01' };
    const redacted = redactEntityFields(employee, 'employee' as any, role);
    expect(redacted.personalEmail).toBeNull();
    expect(redacted.birthdate).toBe('1990-01-01');
    expect('personalEmail' in redacted).toBe(true);
  });

  it('redactEntityFields also nulls the resolved relation object alongside its FK, so the value cannot leak through it', () => {
    const role = roleContext({
      permissions: new Set([VIEW_COMPANY]),
      hiddenFieldsByEntity: new Map([['company' as any, new Set(['accountOwnerId'])]]),
    });
    const company = { id: 'c1', name: 'Acme', accountOwnerId: 'u1', accountOwner: { id: 'u1', firstName: 'Bo', lastName: 'Smith' } };
    const redacted = redactEntityFields(company, 'company' as any, role) as any;
    expect(redacted.accountOwnerId).toBeNull();
    expect(redacted.accountOwner).toBeNull();
  });

  it('redactEntityListFields is a no-op for an owner', () => {
    const owner = roleContext({ isOwner: true });
    const list = [{ id: 'e1', personalEmail: 'a@b.com' }];
    expect(redactEntityListFields(list, 'employee' as any, owner)).toBe(list);
  });

  it('canViewOpportunity-derived module gate: a role missing view_contact cannot see any Opportunity field', () => {
    const role = roleContext({ permissions: new Set([VIEW_COMPANY]) }); // has company, not contact
    expect(isFieldVisible(role, 'opportunity' as any, 'amountCents')).toBe(false);
  });
});
