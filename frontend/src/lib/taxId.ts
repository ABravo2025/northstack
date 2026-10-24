import { countryCode } from './countries';

// Mirrors src/lib/taxId.ts on the backend (which has the last word): CUIT/CUIL in Argentina,
// EIN/SSN in the US — required there (a person's only when hired as an employee) — and free text
// elsewhere. Labels and hints: common.json → taxId.*.
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

function cuitCheckDigitOk(digits: string): boolean {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((n, w, i) => n + w * Number(digits[i]), 0);
  const mod = 11 - (sum % 11);
  return (mod === 11 ? 0 : mod === 10 ? 9 : mod) === Number(digits[10]);
}

export function isTaxIdValid(kind: TaxIdKind, raw: string): boolean {
  const text = raw.trim();
  if (kind === 'other') return /^[A-Za-z0-9][A-Za-z0-9 ./-]{1,28}[A-Za-z0-9]$/.test(text);
  if (/[^0-9\s.-]/.test(text)) return false;
  const digits = text.replace(/\D/g, '');
  if (kind === 'cuit' || kind === 'cuil') return digits.length === 11 && cuitCheckDigitOk(digits);
  return digits.length === 9 && !/^0+$/.test(digits);
}
