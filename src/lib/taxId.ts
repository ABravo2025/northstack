import { countryCode } from './country.js';

// Tax IDs for payslips (Alejandro, 2026-10-24): the company's (CUIT in Argentina, EIN in the US)
// and each person's (CUIL in Argentina, SSN in the US). Required only in Argentina and the US —
// the company's always, a person's only when hired as an employee. Other countries: optional,
// free text, since we can't know every country's format.
export type TaxIdKind = 'cuit' | 'cuil' | 'ein' | 'ssn' | 'other';

export function companyTaxIdKind(country: string | null | undefined): TaxIdKind {
  const cc = countryCode(country);
  return cc === 'AR' ? 'cuit' : cc === 'US' ? 'ein' : 'other';
}

export function personTaxIdKind(country: string | null | undefined): TaxIdKind {
  const cc = countryCode(country);
  return cc === 'AR' ? 'cuil' : cc === 'US' ? 'ssn' : 'other';
}

const isRequiredCountry = (country: string | null | undefined) => ['AR', 'US'].includes(countryCode(country) ?? '');

export const companyTaxIdRequired = (country: string | null | undefined) => isRequiredCountry(country);

export const personTaxIdRequired = (country: string | null | undefined, personType: string | null | undefined) =>
  isRequiredCountry(country) && personType === 'employee';

// CUIT and CUIL share the format: 11 digits, the last one a mod-11 check digit.
function cuitCheckDigitOk(digits: string): boolean {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((n, w, i) => n + w * Number(digits[i]), 0);
  const mod = 11 - (sum % 11);
  const expected = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return expected === Number(digits[10]);
}

export type TaxIdCheck = { ok: true; value: string } | { ok: false; error: string };

const MESSAGES: Record<TaxIdKind, string> = {
  cuit: 'Enter a valid CUIT (11 digits)',
  cuil: 'Enter a valid CUIL (11 digits)',
  ein: 'Enter a valid EIN (9 digits)',
  ssn: 'Enter a valid SSN (9 digits)',
  other: 'Enter a valid tax ID (3 to 30 letters, numbers, dots, dashes or slashes)',
};

// Normalizes to the usual printed form: CUIT/CUIL 20-12345678-9, EIN 12-3456789, SSN 123-45-6789.
export function validateTaxId(kind: TaxIdKind, raw: unknown): TaxIdCheck {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (kind === 'other') {
    return /^[A-Za-z0-9][A-Za-z0-9 ./-]{1,28}[A-Za-z0-9]$/.test(text) ? { ok: true, value: text.toUpperCase() } : { ok: false, error: MESSAGES.other };
  }
  if (/[^0-9\s.-]/.test(text)) return { ok: false, error: MESSAGES[kind] };
  const digits = text.replace(/\D/g, '');
  if (kind === 'cuit' || kind === 'cuil') {
    if (digits.length !== 11 || !cuitCheckDigitOk(digits)) return { ok: false, error: MESSAGES[kind] };
    return { ok: true, value: `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}` };
  }
  if (digits.length !== 9 || /^0+$/.test(digits)) return { ok: false, error: MESSAGES[kind] };
  return kind === 'ein'
    ? { ok: true, value: `${digits.slice(0, 2)}-${digits.slice(2)}` }
    : { ok: true, value: `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` };
}

export const taxIdLabel = (kind: TaxIdKind) => (kind === 'other' ? 'Tax ID' : kind.toUpperCase());

// What screens (and non-Argentine payslips) show: only the last 4. An Argentine payslip prints
// the full CUIL, as the local recibo does.
export function maskTaxId(kind: TaxIdKind, value: string): string {
  const last4 = value.replace(/[^A-Za-z0-9]/g, '').slice(-4);
  return kind === 'ssn' ? `XXX-XX-${last4}` : `•••• ${last4}`;
}
