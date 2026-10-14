import { describe, expect, it } from 'vitest';
import { filledPlaces, hasStarted, needsManager, parseReason } from '../src/modules/shifts/shiftRequestService.js';

const settings = { swapNeedsApproval: true, openShiftNeedsApproval: false };

describe('shift requests (phase 2, block A)', () => {
  it('who decides: settings by type, and always a manager when there is a warning', () => {
    expect(needsManager('claim', settings, [])).toBe(false);
    expect(needsManager('give', settings, [])).toBe(true);
    expect(needsManager('swap', settings, [])).toBe(true);
    expect(needsManager('swap', { swapNeedsApproval: false, openShiftNeedsApproval: false }, [])).toBe(false);
    expect(needsManager('claim', settings, ['rest'])).toBe(true);
    expect(needsManager('give', { swapNeedsApproval: false, openShiftNeedsApproval: false }, ['expired_skill'])).toBe(true);
  });

  it('counts filled places without declined ones', () => {
    expect(filledPlaces([{ status: 'accepted' }, { status: 'pending' }, { status: 'declined' }])).toBe(2);
  });

  it('a shift that started can no longer change hands', () => {
    const now = new Date('2026-10-14T12:00:00Z');
    expect(hasStarted({ startsAt: new Date('2026-10-14T11:59:00Z') }, now)).toBe(true);
    expect(hasStarted({ startsAt: new Date('2026-10-14T12:01:00Z') }, now)).toBe(false);
  });

  it('reasons are optional and trimmed', () => {
    expect(parseReason('  doctor  ')).toBe('doctor');
    expect(parseReason('')).toBeNull();
    expect(parseReason(undefined)).toBeNull();
    expect(parseReason('x'.repeat(400))?.length).toBe(300);
  });
});
