import { countryCode } from './country.js';

// Numbers follow the company's country, not the reader's language (Alejandro, 2026-10-24):
// Argentina 125.000,00, the US 125,000.00, every other country its own convention. Same rule as
// the frontend's lib/currencies.ts localeForCountry. Takes the country name or its ISO code.
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
