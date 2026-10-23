// Payroll v2 payslip: the net amount written out ("dos millones doscientos ochenta mil pesos"),
// Spanish and English. Pure, tested. Cents go as "con 50/100" / "and 50/100".

const ES_UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const ES_TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const ES_HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function es999(n: number): string {
  if (n === 100) return 'cien';
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(ES_HUNDREDS[h]);
  if (r) {
    if (r < 30) parts.push(ES_UNITS[r]);
    else parts.push(r % 10 ? `${ES_TENS[Math.floor(r / 10)]} y ${ES_UNITS[r % 10]}` : ES_TENS[r / 10]);
  }
  return parts.join(' ');
}

// "uno" becomes "un" before a noun: "un millón", "veintiún mil", "un peso".
const apocope = (s: string) => s.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');

export function spanishWords(n: number): string {
  if (n === 0) return 'cero';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? 'un millón' : `${apocope(spanishWords(millions))} millones`);
  if (thousands) parts.push(thousands === 1 ? 'mil' : `${apocope(es999(thousands))} mil`);
  if (rest) parts.push(es999(rest));
  return parts.join(' ');
}

const EN_UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function en999(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${EN_UNITS[h]} hundred`);
  if (r) parts.push(r < 20 ? EN_UNITS[r] : r % 10 ? `${EN_TENS[Math.floor(r / 10)]}-${EN_UNITS[r % 10]}` : EN_TENS[r / 10]);
  return parts.join(' ');
}

export function englishWords(n: number): string {
  if (n === 0) return 'zero';
  const scales: [number, string][] = [[1_000_000_000, 'billion'], [1_000_000, 'million'], [1000, 'thousand']];
  const parts: string[] = [];
  let rest = n;
  for (const [size, name] of scales) {
    const q = Math.floor(rest / size);
    if (q) parts.push(`${englishWords(q)} ${name}`);
    rest %= size;
  }
  if (rest) parts.push(en999(rest));
  return parts.join(' ');
}

const CURRENCY: Record<string, { es: [string, string]; en: [string, string] }> = {
  ARS: { es: ['peso', 'pesos'], en: ['Argentine peso', 'Argentine pesos'] },
  USD: { es: ['dólar estadounidense', 'dólares estadounidenses'], en: ['dollar', 'dollars'] },
  EUR: { es: ['euro', 'euros'], en: ['euro', 'euros'] },
  UYU: { es: ['peso uruguayo', 'pesos uruguayos'], en: ['Uruguayan peso', 'Uruguayan pesos'] },
  CLP: { es: ['peso chileno', 'pesos chilenos'], en: ['Chilean peso', 'Chilean pesos'] },
  MXN: { es: ['peso mexicano', 'pesos mexicanos'], en: ['Mexican peso', 'Mexican pesos'] },
  BRL: { es: ['real', 'reales'], en: ['Brazilian real', 'Brazilian reals'] },
};

export function amountInWords(cents: number, currency: string, lang: 'es' | 'en'): string {
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  const names = CURRENCY[currency]?.[lang] ?? [currency, currency];
  const noun = whole === 1 ? names[0] : names[1];
  let words = lang === 'es' ? spanishWords(whole) : englishWords(whole);
  if (lang === 'es') {
    words = apocope(words);
    // "un millón de pesos", "dos millones de pesos"
    if (whole >= 1_000_000 && whole % 1_000_000 === 0) words += ' de';
  }
  const sign = cents < 0 ? (lang === 'es' ? 'menos ' : 'minus ') : '';
  const tail = fraction ? (lang === 'es' ? ` con ${String(fraction).padStart(2, '0')}/100` : ` and ${String(fraction).padStart(2, '0')}/100`) : '';
  const text = `${sign}${words} ${noun}${tail}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
