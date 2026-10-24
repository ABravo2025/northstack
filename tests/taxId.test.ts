import { describe, expect, it } from 'vitest';
import { companyTaxIdKind, companyTaxIdRequired, maskTaxId, personTaxIdKind, personTaxIdRequired, validateTaxId } from '../src/lib/taxId.js';
import { countryCode } from '../src/lib/country.js';
import { localeForCountry } from '../src/lib/numberLocale.js';

describe('countryCode', () => {
  it('reads the signup country names and ISO codes', () => {
    expect(countryCode('Argentina')).toBe('AR');
    expect(countryCode('United States')).toBe('US');
    expect(countryCode('Turkey')).toBe('TR');
    expect(countryCode('Ivory Coast')).toBe('CI');
    expect(countryCode('ar')).toBe('AR');
    expect(countryCode('Atlantis')).toBeNull();
    expect(countryCode(null)).toBeNull();
  });

  it('formats numbers by country, from the name too', () => {
    expect(localeForCountry('Argentina')).toBe('es-AR');
    expect(localeForCountry('United States')).toBe('en-US');
    expect(localeForCountry('Germany')).toBe('de-DE');
    expect(localeForCountry(null)).toBe('en-US');
  });
});

describe('tax IDs', () => {
  it('asks CUIT/CUIL in Argentina, EIN/SSN in the US, free text elsewhere', () => {
    expect(companyTaxIdKind('Argentina')).toBe('cuit');
    expect(personTaxIdKind('Argentina')).toBe('cuil');
    expect(companyTaxIdKind('United States')).toBe('ein');
    expect(personTaxIdKind('United States')).toBe('ssn');
    expect(personTaxIdKind('Mexico')).toBe('other');
  });

  it('requires them only in Argentina and the US, and a person\'s only for employees', () => {
    expect(companyTaxIdRequired('Argentina')).toBe(true);
    expect(companyTaxIdRequired('Spain')).toBe(false);
    expect(personTaxIdRequired('United States', 'employee')).toBe(true);
    expect(personTaxIdRequired('United States', 'contractor')).toBe(false);
    expect(personTaxIdRequired('Spain', 'employee')).toBe(false);
  });

  it('checks the CUIT/CUIL check digit and normalizes the format', () => {
    expect(validateTaxId('cuil', '20123456786')).toEqual({ ok: true, value: '20-12345678-6' });
    expect(validateTaxId('cuit', '30-71234567-1')).toEqual({ ok: true, value: '30-71234567-1' });
    expect(validateTaxId('cuit', '30-71234567-2').ok).toBe(false);
    expect(validateTaxId('cuil', '2012345678').ok).toBe(false);
    expect(validateTaxId('cuil', 'abc').ok).toBe(false);
  });

  it('formats EIN and SSN, rejecting the wrong length', () => {
    expect(validateTaxId('ein', '123456789')).toEqual({ ok: true, value: '12-3456789' });
    expect(validateTaxId('ssn', '123 45 6789')).toEqual({ ok: true, value: '123-45-6789' });
    expect(validateTaxId('ssn', '000000000').ok).toBe(false);
    expect(validateTaxId('ssn', '12345').ok).toBe(false);
  });

  it('accepts any reasonable tax ID in other countries', () => {
    expect(validateTaxId('other', 'b12345678')).toEqual({ ok: true, value: 'B12345678' });
    expect(validateTaxId('other', 'x').ok).toBe(false);
  });

  it('masks to the last 4', () => {
    expect(maskTaxId('ssn', '123-45-6789')).toBe('XXX-XX-6789');
    expect(maskTaxId('cuil', '20-12345678-6')).toBe('•••• 6786');
  });
});
