import { describe, expect, it } from 'vitest';
import { isDueForReminder, isTomorrowAt, remindedRecently, skillNoticeDay } from '../src/modules/shifts/shiftReminderService.js';

const hoursAgo = (now: Date, h: number) => new Date(now.getTime() - h * 3600 * 1000);

describe('isTomorrowAt', () => {
  // 12:00 UTC = 09:00 in Buenos Aires, 21:00 in Tokyo, 02:00 in Honolulu (same UTC day).
  const now = new Date('2026-10-12T12:00:00Z');

  it("uses the location's own calendar day", () => {
    expect(isTomorrowAt('2026-10-13', now, 'America/Argentina/Buenos_Aires')).toBe(true);
    expect(isTomorrowAt('2026-10-12', now, 'America/Argentina/Buenos_Aires')).toBe(false);
    expect(isTomorrowAt('2026-10-13', now, 'Asia/Tokyo')).toBe(true);
  });

  it('handles locations already on the next day', () => {
    // 23:30 UTC is already Oct 13 in Tokyo, so its tomorrow is Oct 14.
    const late = new Date('2026-10-12T23:30:00Z');
    expect(isTomorrowAt('2026-10-14', late, 'Asia/Tokyo')).toBe(true);
    expect(isTomorrowAt('2026-10-13', late, 'Asia/Tokyo')).toBe(false);
  });
});

describe('isDueForReminder', () => {
  const now = new Date('2026-10-12T12:00:00Z');

  it('waits about a day after the first notice', () => {
    expect(isDueForReminder({ notifiedAt: hoursAgo(now, 3), lastRemindedAt: null }, now)).toBe(false);
    expect(isDueForReminder({ notifiedAt: hoursAgo(now, 23), lastRemindedAt: null }, now)).toBe(true);
  });

  it('reminds at most once a day', () => {
    expect(isDueForReminder({ notifiedAt: hoursAgo(now, 72), lastRemindedAt: hoursAgo(now, 2) }, now)).toBe(false);
    expect(isDueForReminder({ notifiedAt: hoursAgo(now, 72), lastRemindedAt: hoursAgo(now, 24) }, now)).toBe(true);
  });

  it('never reminds about an assignment nobody was told about', () => {
    expect(isDueForReminder({ notifiedAt: null, lastRemindedAt: null }, now)).toBe(false);
  });

  it('treats a re-run on the same day as already sent', () => {
    expect(remindedRecently(hoursAgo(now, 1), now)).toBe(true);
    expect(remindedRecently(hoursAgo(now, 25), now)).toBe(false);
    expect(remindedRecently(null, now)).toBe(false);
  });
});

describe('skillNoticeDay', () => {
  it('fires 30 days before, 7 days before and on the last valid day', () => {
    expect(skillNoticeDay('2026-11-11', '2026-10-12')).toBe(30);
    expect(skillNoticeDay('2026-10-19', '2026-10-12')).toBe(7);
    expect(skillNoticeDay('2026-10-12', '2026-10-12')).toBe(0);
  });

  it('stays quiet on other days, and once expired', () => {
    expect(skillNoticeDay('2026-10-20', '2026-10-12')).toBeNull();
    expect(skillNoticeDay('2026-10-11', '2026-10-12')).toBeNull();
  });
});
