import { countryCode } from './countries';

// ISO-4217 codes come straight from the runtime's own Intl data instead of a
// hand-maintained list. Falls back to a short common-currency list on engines
// without Intl.supportedValuesOf (Safari < 15.4).
const FALLBACK_CURRENCIES = ['USD', 'EUR', 'GBP', 'ARS', 'BRL', 'MXN', 'CAD', 'AUD', 'JPY', 'CNY'];

export const CURRENCY_CODES: string[] =
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : FALLBACK_CURRENCIES;

const currencyDisplayNames =
  typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'currency' }) : null;

export function currencyLabel(code: string): string {
  const name = currencyDisplayNames?.of(code);
  return name && name !== code ? `${code} — ${name}` : code;
}

// Numbers follow the company's country, not the viewer's language (Alejandro, 2026-10-24):
// Argentina 125.000,00, the US 125,000.00, every other country its own convention. App.tsx sets
// the country once the tenant loads; until then (and with no country) it's en-US.
let numberLocaleTag = 'en-US';

export function localeForCountry(country: string | null | undefined): string {
  const cc = countryCode(country);
  if (!cc) return 'en-US';
  try {
    const likely = new Intl.Locale(`und-${cc}`).maximize();
    return likely.language && likely.language !== 'und' ? `${likely.language}-${cc}` : 'en-US';
  } catch {
    return 'en-US';
  }
}

export function setNumberCountry(country: string | null | undefined): void {
  numberLocaleTag = localeForCountry(country);
}

export const numberLocale = (): string => numberLocaleTag;

export function formatNumber(n: number, maximumFractionDigits = 2): string {
  return n.toLocaleString(numberLocaleTag, { maximumFractionDigits });
}

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat(numberLocaleTag, { style: 'currency', currency }).format(cents / 100);
}
