// Tenant.country holds the English country name picked at signup ("Argentina", "United States"),
// not an ISO code. countryCode turns either form into the ISO-3166 alpha-2 code ("AR", "US") so
// country rules (payslip model, payment methods, number format, tax IDs) can compare codes.
// Mirrors frontend/src/lib/countries.ts's countryCode.
const ALIASES: Record<string, string> = {
  'bosnia and herzegovina': 'BA',
  'czech republic': 'CZ',
  'democratic republic of the congo': 'CD',
  'hong kong': 'HK',
  'ivory coast': 'CI',
  myanmar: 'MM',
  'republic of the congo': 'CG',
  'trinidad and tobago': 'TT',
  turkey: 'TR',
};

let byName: Map<string, string> | null = null;
function nameIndex(): Map<string, string> {
  if (byName) return byName;
  byName = new Map(Object.entries(ALIASES));
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  for (let a = 65; a < 91; a++) {
    for (let b = 65; b < 91; b++) {
      const code = String.fromCharCode(a, b);
      try {
        // Skip retired codes (DD, YU…): they canonicalize to the current one.
        if (Intl.getCanonicalLocales(`und-${code}`)[0] !== `und-${code}`) continue;
        const name = names.of(code);
        if (name && name !== code && !byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), code);
      } catch {
        // not a region code
      }
    }
  }
  return byName;
}

export function countryCode(country: string | null | undefined): string | null {
  const value = (country ?? '').trim();
  if (!value) return null;
  if (/^[A-Za-z]{2}$/.test(value)) return value.toUpperCase();
  return nameIndex().get(value.toLowerCase()) ?? null;
}
