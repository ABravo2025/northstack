import { describe, expect, it } from 'vitest';
import { buildIcs, escapeIcsText, foldIcsLine, formatIcsUtc, shiftEventUid } from '../src/modules/shifts/shiftIcs.js';

describe('shift .ics', () => {
  const base = {
    uid: shiftEventUid('a1'),
    sequence: 3,
    startsAt: new Date('2026-10-12T10:00:00Z'),
    endsAt: new Date('2026-10-12T14:30:00Z'),
    summary: 'Turno · Análisis, fisicoquímico',
    location: 'Laboratorio Central; Av. Corrientes 4120',
    description: 'Traer EPP\nCalibrar HPLC',
  };

  it('formats UTC timestamps', () => {
    expect(formatIcsUtc(new Date('2026-10-12T10:00:00.000Z'))).toBe('20261012T100000Z');
  });

  it('escapes text', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('builds a publishable calendar with CRLF line endings and a stable UID', () => {
    const ics = buildIcs([base], new Date('2026-10-04T00:00:00Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics).toContain('METHOD:PUBLISH');
    expect(ics).toContain('UID:shift-a1@joinnorthstack.com');
    expect(ics).toContain('SEQUENCE:3');
    expect(ics).toContain('DTSTART:20261012T100000Z');
    expect(ics).toContain('DTEND:20261012T143000Z');
    expect(ics).toContain('SUMMARY:Turno · Análisis\\, fisicoquímico');
    expect(ics).toContain('DESCRIPTION:Traer EPP\\nCalibrar HPLC');
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '').includes('\n')).toBe(false);
  });

  it('a cancellation uses METHOD:CANCEL', () => {
    const ics = buildIcs([{ ...base, cancelled: true }]);
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
  });

  it('folds long lines at 75 octets without splitting characters', () => {
    const folded = foldIcsLine('DESCRIPTION:' + 'á'.repeat(60));
    for (const line of folded.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n').map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe('DESCRIPTION:' + 'á'.repeat(60));
  });
});
