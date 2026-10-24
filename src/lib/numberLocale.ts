// Numbers follow the company's country, not the reader's language (Alejandro, 2026-10-24):
// Argentina 125.000,00, the US 125,000.00, every other country its own convention. Same rule as
// the frontend's lib/currencies.ts localeForCountry.
export function localeForCountry(country: string | null | undefined): string {
  const cc = (country ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return 'en-US';
  try {
    const likely = new Intl.Locale(`und-${cc}`).maximize();
    return likely.language && likely.language !== 'und' ? `${likely.language}-${cc}` : 'en-US';
  } catch {
    return 'en-US';
  }
}
