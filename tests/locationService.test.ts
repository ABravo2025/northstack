import { describe, expect, it } from 'vitest';
import { parseLocationInput } from '../src/modules/shifts/locationService.js';

describe('parseLocationInput', () => {
  it('create needs a name and a real time zone', () => {
    expect(parseLocationInput({ name: '  Lab Central ', timezone: 'America/Argentina/Buenos_Aires' }, 'create')).toEqual({
      success: true,
      value: { name: 'Lab Central', timezone: 'America/Argentina/Buenos_Aires' },
    });
    const noName = parseLocationInput({ timezone: 'UTC' }, 'create');
    expect(noName.success).toBe(false);
    if (!noName.success) expect(noName.field).toBe('name');
    const badZone = parseLocationInput({ name: 'X', timezone: 'Nowhere/Land' }, 'create');
    expect(badZone.success).toBe(false);
    if (!badZone.success) expect(badZone.field).toBe('timezone');
  });

  it('update only validates what was sent', () => {
    expect(parseLocationInput({ isActive: false }, 'update')).toEqual({ success: true, value: { isActive: false } });
  });

  it('blank address becomes null; manager can be cleared', () => {
    expect(parseLocationInput({ address: '   ', managerEmployeeId: null }, 'update')).toEqual({
      success: true,
      value: { address: null, managerEmployeeId: null },
    });
  });

  it('rejects a too-long name and a non-boolean active flag', () => {
    expect(parseLocationInput({ name: 'x'.repeat(121) }, 'update').success).toBe(false);
    expect(parseLocationInput({ isActive: 'no' }, 'update').success).toBe(false);
  });
});
