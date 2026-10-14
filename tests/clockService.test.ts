import { describe, expect, it } from 'vitest';
import { distanceMeters, generateClockCode, geoCheck, isLate, methodAllows, parseClockConfig, parseGeo, workedMinutes } from '../src/modules/shifts/clockService.js';

describe('clock-in (phase 2, block B)', () => {
  it('distance between two points (Obelisco → Plaza de Mayo ≈ 1.3 km)', () => {
    const d = distanceMeters({ lat: -34.6037, lng: -58.3816 }, { lat: -34.6083, lng: -58.3712 });
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1200);
    expect(distanceMeters({ lat: 1, lng: 1 }, { lat: 1, lng: 1 })).toBe(0);
  });

  it('late only past the tolerance', () => {
    const start = new Date('2026-10-14T12:00:00Z');
    expect(isLate(new Date('2026-10-14T12:05:00Z'), start, 5)).toBe(false);
    expect(isLate(new Date('2026-10-14T12:05:01Z'), start, 5)).toBe(true);
    expect(isLate(new Date('2026-10-14T11:50:00Z'), start, 0)).toBe(false);
  });

  it('worked minutes minus breaks, running while open', () => {
    const inAt = new Date('2026-10-14T12:00:00Z');
    expect(workedMinutes({ clockInAt: inAt, clockOutAt: new Date('2026-10-14T20:00:00Z'), breakMinutes: 30 })).toBe(450);
    expect(workedMinutes({ clockInAt: inAt, clockOutAt: null, breakMinutes: 0 }, new Date('2026-10-14T13:30:00Z'))).toBe(90);
    expect(workedMinutes({ clockInAt: inAt, clockOutAt: new Date('2026-10-14T12:10:00Z'), breakMinutes: 30 })).toBe(0);
  });

  it('method per location', () => {
    expect(methodAllows('qr_or_app', 'qr')).toBe(true);
    expect(methodAllows('qr', 'app')).toBe(false);
    expect(methodAllows('off', 'qr')).toBe(false);
  });

  it('QR codes: 12 unambiguous characters, all different', () => {
    const codes = new Set(Array.from({ length: 50 }, generateClockCode));
    expect(codes.size).toBe(50);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{12}$/);
  });

  it('position check only where the location asks for it', () => {
    const loc = { requireLocation: true, latitude: -34.6037, longitude: -58.3816, radiusMeters: 150 };
    expect(geoCheck({ ...loc, requireLocation: false }, null)).toBeNull();
    expect(geoCheck(loc, null)).toEqual({ distance: null, away: true });
    expect(geoCheck(loc, { lat: -34.6037, lng: -58.3816 })).toEqual({ distance: 0, away: false });
    expect(geoCheck(loc, { lat: -34.6083, lng: -58.3712 })?.away).toBe(true);
    expect(parseGeo({ lat: 200, lng: 0 })).toBeNull();
    expect(parseGeo('x')).toBeNull();
  });

  it('location setup validation', () => {
    expect(parseClockConfig({ clockMethod: 'qr', radiusMeters: 200 })).toEqual({ success: true, value: { clockMethod: 'qr', radiusMeters: 200 } });
    expect(parseClockConfig({ clockMethod: 'nfc' }).success).toBe(false);
    expect(parseClockConfig({ radiusMeters: 5 }).success).toBe(false);
    expect(parseClockConfig({ latitude: 91 }).success).toBe(false);
  });
});
