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

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}
