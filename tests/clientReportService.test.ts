import { describe, expect, it } from 'vitest';
import { hashReportToken, hoursLabel, summarize } from '../src/modules/shifts/clientReportService.js';

const line = (minutes: number, billable: boolean, person = 'Ana Ruiz') => ({ date: '2026-10-05', person, description: 'Work', project: null, minutes, billable });

describe('client hours report', () => {
  it('adds up total and billable minutes', () => {
    const s = summarize([line(90, true), line(30, false), line(45, true)], true);
    expect(s.totalMinutes).toBe(165);
    expect(s.billableMinutes).toBe(135);
    expect(s.lines[0].person).toBe('Ana Ruiz');
  });

  it('hides people when asked', () => {
    const s = summarize([line(60, true), line(60, true, 'Bo Diaz')], false);
    expect(s.lines.every((l) => l.person === null)).toBe(true);
    expect(s.totalMinutes).toBe(120);
  });

  it('formats hours', () => {
    expect(hoursLabel(0)).toBe('0h');
    expect(hoursLabel(60)).toBe('1h');
    expect(hoursLabel(95)).toBe('1h 35m');
    expect(hoursLabel(605)).toBe('10h 05m');
  });

  it('hashes tokens deterministically, never storing the token itself', () => {
    expect(hashReportToken('abc')).toBe(hashReportToken('abc'));
    expect(hashReportToken('abc')).not.toBe('abc');
    expect(hashReportToken('abc')).toHaveLength(64);
  });
});
