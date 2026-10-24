// Plain country names, no ISO codes needed anywhere downstream yet — stored as a
// free string on Tenant.country. Alphabetical, English names.
export const COUNTRIES = [
  'Afghanistan',
  'Albania',
  'Algeria',
  'Andorra',
  'Angola',
  'Argentina',
  'Armenia',
  'Australia',
  'Austria',
  'Azerbaijan',
  'Bahamas',
  'Bahrain',
  'Bangladesh',
  'Barbados',
  'Belarus',
  'Belgium',
  'Belize',
  'Benin',
  'Bhutan',
  'Bolivia',
  'Bosnia and Herzegovina',
  'Botswana',
  'Brazil',
  'Brunei',
  'Bulgaria',
  'Burkina Faso',
  'Burundi',
  'Cambodia',
  'Cameroon',
  'Canada',
  'Cape Verde',
  'Central African Republic',
  'Chad',
  'Chile',
  'China',
  'Colombia',
  'Comoros',
  'Costa Rica',
  'Croatia',
  'Cuba',
  'Cyprus',
  'Czech Republic',
  'Democratic Republic of the Congo',
  'Denmark',
  'Djibouti',
  'Dominican Republic',
  'Ecuador',
  'Egypt',
  'El Salvador',
  'Equatorial Guinea',
  'Eritrea',
  'Estonia',
  'Eswatini',
  'Ethiopia',
  'Fiji',
  'Finland',
  'France',
  'Gabon',
  'Gambia',
  'Georgia',
  'Germany',
  'Ghana',
  'Greece',
  'Guatemala',
  'Guinea',
  'Guyana',
  'Haiti',
  'Honduras',
  'Hong Kong',
  'Hungary',
  'Iceland',
  'India',
  'Indonesia',
  'Iran',
  'Iraq',
  'Ireland',
  'Israel',
  'Italy',
  'Ivory Coast',
  'Jamaica',
  'Japan',
  'Jordan',
  'Kazakhstan',
  'Kenya',
  'Kuwait',
  'Kyrgyzstan',
  'Laos',
  'Latvia',
  'Lebanon',
  'Lesotho',
  'Liberia',
  'Libya',
  'Liechtenstein',
  'Lithuania',
  'Luxembourg',
  'Madagascar',
  'Malawi',
  'Malaysia',
  'Maldives',
  'Mali',
  'Malta',
  'Mauritania',
  'Mauritius',
  'Mexico',
  'Moldova',
  'Monaco',
  'Mongolia',
  'Montenegro',
  'Morocco',
  'Mozambique',
  'Myanmar',
  'Namibia',
  'Nepal',
  'Netherlands',
  'New Zealand',
  'Nicaragua',
  'Niger',
  'Nigeria',
  'North Korea',
  'North Macedonia',
  'Norway',
  'Oman',
  'Pakistan',
  'Panama',
  'Papua New Guinea',
  'Paraguay',
  'Peru',
  'Philippines',
  'Poland',
  'Portugal',
  'Qatar',
  'Republic of the Congo',
  'Romania',
  'Russia',
  'Rwanda',
  'Saudi Arabia',
  'Senegal',
  'Serbia',
  'Sierra Leone',
  'Singapore',
  'Slovakia',
  'Slovenia',
  'Somalia',
  'South Africa',
  'South Korea',
  'South Sudan',
  'Spain',
  'Sri Lanka',
  'Sudan',
  'Suriname',
  'Sweden',
  'Switzerland',
  'Syria',
  'Taiwan',
  'Tajikistan',
  'Tanzania',
  'Thailand',
  'Togo',
  'Trinidad and Tobago',
  'Tunisia',
  'Turkey',
  'Turkmenistan',
  'Uganda',
  'Ukraine',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
  'Uruguay',
  'Uzbekistan',
  'Venezuela',
  'Vietnam',
  'Yemen',
  'Zambia',
  'Zimbabwe',
];

// Tenant.country stores one of the names above, not an ISO code. countryCode turns a name (or an
// ISO code) into the alpha-2 code ("Argentina" → "AR") so country rules can compare codes.
// Mirrors src/lib/country.ts on the backend.
const COUNTRY_ALIASES: Record<string, string> = {
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

let countryIndex: Map<string, string> | null = null;
function countryNameIndex(): Map<string, string> {
  if (countryIndex) return countryIndex;
  countryIndex = new Map(Object.entries(COUNTRY_ALIASES));
  if (typeof Intl.DisplayNames !== 'function') return countryIndex;
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  for (let a = 65; a < 91; a++) {
    for (let b = 65; b < 91; b++) {
      const code = String.fromCharCode(a, b);
      try {
        // Skip retired codes (DD, YU…): they canonicalize to the current one.
        if (Intl.getCanonicalLocales(`und-${code}`)[0] !== `und-${code}`) continue;
        const name = names.of(code);
        if (name && name !== code && !countryIndex.has(name.toLowerCase())) countryIndex.set(name.toLowerCase(), code);
      } catch {
        // not a region code
      }
    }
  }
  return countryIndex;
}

export function countryCode(country: string | null | undefined): string | null {
  const value = (country ?? '').trim();
  if (!value) return null;
  if (/^[A-Za-z]{2}$/.test(value)) return value.toUpperCase();
  return countryNameIndex().get(value.toLowerCase()) ?? null;
}

// The signed-in company's country, for rules that depend on it (tax IDs). App.tsx sets it while
// rendering, next to setNumberCountry, once the tenant loads.
let tenantCountry: string | null = null;
export const setTenantCountry = (country: string | null | undefined) => {
  tenantCountry = country ?? null;
};
export const currentTenantCountry = () => tenantCountry;
