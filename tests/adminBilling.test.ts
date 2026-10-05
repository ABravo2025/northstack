import { describe, expect, it } from 'vitest';
import { addMonths, targetChargeDate } from '../src/modules/platform/adminActionService.js';
import { buildZip, crc32 } from '../src/lib/zip.js';

describe('addMonths (free months credit)', () => {
  it('moves the charge the same day N months later', () => {
    expect(addMonths(new Date('2026-10-12T09:30:00Z'), 1).toISOString()).toBe('2026-11-12T09:30:00.000Z');
    expect(addMonths(new Date('2026-10-12T09:30:00Z'), 3).toISOString()).toBe('2027-01-12T09:30:00.000Z');
  });
  it('clamps to the end of a shorter month instead of spilling into the next one', () => {
    expect(addMonths(new Date('2027-01-31T00:00:00Z'), 1).toISOString()).toBe('2027-02-28T00:00:00.000Z');
    expect(addMonths(new Date('2028-01-31T00:00:00Z'), 1).toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect(addMonths(new Date('2026-08-31T00:00:00Z'), 1).toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });
});

describe('targetChargeDate (next charge on a specific date)', () => {
  const now = new Date('2026-10-05T12:00:00Z');
  const current = new Date('2026-10-12T09:30:00Z');
  it('takes an exact date, keeping the charge time of day', () => {
    const r = targetChargeDate(current, { date: '2026-12-01' }, now);
    expect(r.ok && r.date.toISOString()).toBe('2026-12-01T09:30:00.000Z');
  });
  it('or N months after the current next charge', () => {
    const r = targetChargeDate(current, { months: 2 }, now);
    expect(r.ok && r.date.toISOString()).toBe('2026-12-12T09:30:00.000Z');
  });
  it('only from tomorrow and up to a year ahead', () => {
    expect(targetChargeDate(current, { date: '2026-10-05' }, now).ok).toBe(false);
    expect(targetChargeDate(current, { date: '2027-11-01' }, now).ok).toBe(false);
    expect(targetChargeDate(current, { date: 'hola' }, now).ok).toBe(false);
    expect(targetChargeDate(current, { date: '2026-10-08' }, now).ok).toBe(true); // earlier than the current charge = charge sooner
  });
});

describe('buildZip', () => {
  it('uses the standard CRC-32', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('writes a valid archive: one entry per file, readable names and contents', () => {
    const zip = buildZip([
      { name: 'personas.csv', content: 'Nombre,Email\nAna,ana@x.com\n' },
      { name: 'ausencias.csv', content: 'Persona,Días\nJosé Núñez,3\n' },
    ], new Date('2026-10-04T12:00:00Z'));

    // End of central directory record: 2 entries, central directory right after the local entries.
    const eocd = zip.length - 22;
    expect(zip.readUInt32LE(eocd)).toBe(0x06054b50);
    expect(zip.readUInt16LE(eocd + 10)).toBe(2);
    const cdOffset = zip.readUInt32LE(eocd + 16);
    expect(zip.readUInt32LE(cdOffset)).toBe(0x02014b50);

    // Walk the local entries and read each file back.
    const files: Record<string, string> = {};
    let pos = 0;
    while (zip.readUInt32LE(pos) === 0x04034b50) {
      const size = zip.readUInt32LE(pos + 18);
      const nameLen = zip.readUInt16LE(pos + 26);
      const name = zip.subarray(pos + 30, pos + 30 + nameLen).toString('utf8');
      const data = zip.subarray(pos + 30 + nameLen, pos + 30 + nameLen + size);
      expect(zip.readUInt32LE(pos + 14)).toBe(crc32(data));
      files[name] = data.toString('utf8');
      pos += 30 + nameLen + size;
    }
    expect(pos).toBe(cdOffset);
    expect(files['ausencias.csv']).toContain('José Núñez');
    expect(Object.keys(files)).toEqual(['personas.csv', 'ausencias.csv']);
  });
});
