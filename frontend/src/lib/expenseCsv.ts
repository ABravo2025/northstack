// Gastos → CSV import (spec-clientes-gastos-formularios.md, A4/A6). The file is read only in the
// browser: these turn its text into rows with a positive amount + direction, and that is all the
// server ever receives. Pure functions, tested from tests/expenseCsv.test.ts.

export type NumberFormat = 'ar' | 'us';
export type DateFormat = 'dmy' | 'mdy' | 'ymd';
// What the "−" means in this file — or that it has separate Debit/Credit columns, or a D/C column.
export type SignConvention = 'neg_debit' | 'neg_credit' | 'cols' | 'type_col';
export type ColumnKey = 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'type' | 'installment' | 'usd';
export type ColumnMap = Record<ColumnKey, number>; // -1 = not in the file

export const CONVENTIONS: SignConvention[] = ['neg_debit', 'neg_credit', 'cols', 'type_col'];

// Splits CSV text into trimmed cells. The delimiter (; , or tab) is the one that splits the first
// line into the most cells; quoted cells may contain it, line breaks and "" escapes.
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const first = clean.split(/\r?\n/).find((l) => l.trim()) ?? '';
  let delimiter = ';';
  let best = -1;
  for (const d of [';', ',', '\t']) {
    const n = first.split(d).length;
    if (n > best) {
      best = n;
      delimiter = d;
    }
  }
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endRow = () => {
    row.push(cell);
    cell = '';
    if (row.some((c) => c.trim())) out.push(row.map((c) => c.trim()));
    row = [];
  };
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      endRow();
    } else cell += ch;
  }
  endRow();
  return out;
}

// "1.250.000,00" (ar) / "1,250,000.00" (us) → 1250000; "(500,00)" and "500,00-" are negative.
// Returns integer cents, signed, or null when the cell isn't a number.
export function parseSignedCents(value: string | undefined, format: NumberFormat): number | null {
  if (value == null) return null;
  let x = value.replace(/U\$S|US\$|USD|ARS|\$|\s/gi, '');
  if (!x) return null;
  let negative = false;
  if (/^\(.*\)$/.test(x)) {
    negative = true;
    x = x.slice(1, -1);
  }
  if (x.endsWith('-')) {
    negative = true;
    x = x.slice(0, -1);
  }
  if (x.startsWith('-')) {
    negative = !negative;
    x = x.slice(1);
  } else if (x.startsWith('+')) x = x.slice(1);
  x = format === 'ar' ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(x)) return null;
  const cents = Math.round(Number(x) * 100);
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

// A date cell in the chosen order → "YYYY-MM-DD", or null. Two-digit years are 20xx; a trailing
// time ("05/10/2026 14:32") is ignored.
export function parseCsvDate(value: string | undefined, format: DateFormat): string | null {
  const parts = String(value ?? '')
    .trim()
    .split(/\s+/)[0]
    .split(/[/\-.]/);
  if (parts.length < 3) return null;
  const [a, b, c] = parts;
  const [d, m, y] = format === 'ymd' ? [c, b, a] : format === 'mdy' ? [b, a, c] : [a, b, c];
  const year = y.length === 2 ? `20${y}` : y.slice(0, 4);
  const day = Number(d);
  const month = Number(m);
  if (!/^\d{4}$/.test(year) || !(day >= 1 && day <= 31) || !(month >= 1 && month <= 12)) return null;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // Rejects 31/02 and the like.
  return new Date(`${iso}T00:00:00Z`).getUTCDate() === day ? iso : null;
}

// Guesses each column from its header, in Spanish or English.
export function guessColumns(headers: string[]): ColumnMap {
  const find = (re: RegExp, not?: RegExp) => headers.findIndex((h) => re.test(h) && !(not && not.test(h)));
  return {
    date: find(/fecha|date/i),
    description: find(/desc|concepto|detalle|comercio|movimiento|establecimiento|merchant|payee/i),
    amount: find(/importe|monto|amount|valor/i, /saldo|balance|u\$s|usd|d[oó]lar/i),
    debit: find(/d[eé]bito|debe|debit|withdraw/i),
    credit: find(/cr[eé]dito|haber|credit|deposit/i),
    type: find(/^tipo$|^type$|d\/c/i),
    installment: find(/cuota|installment/i),
    // Cruces D4: a card statement's dollar column ("Importe U$S").
    usd: find(/u\$s|usd|d[oó]lar/i, /saldo|balance/i),
  };
}

// Picks the date order that reads every date cell; dmy wins ties (the usual one in AR).
export function guessDateFormat(cells: string[]): DateFormat {
  const filled = cells.filter((c) => c.trim());
  for (const f of ['dmy', 'ymd', 'mdy'] as const) {
    if (filled.length && filled.every((c) => parseCsvDate(c, f))) return f;
  }
  return 'dmy';
}

// "1.234,56" is ar; "1,234.56" is us. Decided by whichever separator comes last in the cells.
export function guessNumberFormat(cells: string[]): NumberFormat {
  let ar = 0;
  let us = 0;
  for (const c of cells) {
    const comma = c.lastIndexOf(',');
    const dot = c.lastIndexOf('.');
    if (comma > dot && /,\d{1,2}\)?-?$/.test(c)) ar++;
    else if (dot > comma && /\.\d{1,2}\)?-?$/.test(c)) us++;
  }
  return us > ar ? 'us' : 'ar';
}

const CREDIT_WORDS = /SU PAGO|PAGO RECIBIDO|BONIF|DEVOLUC|REINTEGRO|ACREDIT|REFUND|PAYMENT THANK|CASHBACK/i;
const DEBIT_WORDS = /D[EÉ]BITO|COMISI[OÓ]N|IMPUESTO|ENVIADA|EXTRACC|PAGO TARJETA|LEY 25413|\bFEE\b|WITHDRAWAL|PURCHASE/i;

export type DetectionReason = 'columns' | 'typeColumn' | 'saved' | 'negCredit' | 'negDebit' | 'fallbackCard' | 'fallbackBank';

// What the "−" means, with the reason the wizard explains (and the descriptions it was based on).
export function detectConvention(
  rows: string[][],
  map: ColumnMap,
  numberFormat: NumberFormat,
  context: { saved?: SignConvention | null; isCard: boolean },
): { convention: SignConvention; reason: DetectionReason; examples: string[] } {
  if (map.debit >= 0 && map.credit >= 0) return { convention: 'cols', reason: 'columns', examples: [] };
  if (map.type >= 0) return { convention: 'type_col', reason: 'typeColumn', examples: [] };
  if (context.saved && context.saved !== 'cols' && context.saved !== 'type_col') {
    return { convention: context.saved, reason: 'saved', examples: [] };
  }
  const negatives = rows.filter((r) => (parseSignedCents(r[map.amount], numberFormat) ?? 0) < 0).map((r) => r[map.description] ?? '');
  const credits = negatives.filter((d) => CREDIT_WORDS.test(d) && !DEBIT_WORDS.test(d));
  const debits = negatives.filter((d) => DEBIT_WORDS.test(d));
  if (credits.length > debits.length) return { convention: 'neg_credit', reason: 'negCredit', examples: credits.slice(0, 2) };
  if (debits.length) return { convention: 'neg_debit', reason: 'negDebit', examples: debits.slice(0, 2) };
  return context.isCard
    ? { convention: 'neg_credit', reason: 'fallbackCard', examples: [] }
    : { convention: 'neg_debit', reason: 'fallbackBank', examples: [] };
}

export interface NormalizedRow {
  date: string | null;
  description: string;
  amountCents: number | null; // positive
  direction: 'debit' | 'credit';
  installment: string | null;
  // A charge only in dollars, converted at the statement's rate: the original amount and the rate.
  original: { currency: 'USD'; amountCents: number; rate: string } | null;
}

// One CSV row → positive amount + direction under the chosen convention. `flipped` is the
// per-row "invert sign" correction from the review step.
export function normalizeRow(
  row: string[],
  map: ColumnMap,
  options: { numberFormat: NumberFormat; dateFormat: DateFormat; convention: SignConvention; usdRate?: number | null },
  flipped = false,
): NormalizedRow {
  const cell = (i: number) => (i >= 0 ? row[i] : undefined);
  let amountCents: number | null = null;
  let direction: 'debit' | 'credit' = 'debit';
  if (options.convention === 'cols') {
    const debit = parseSignedCents(cell(map.debit), options.numberFormat);
    const credit = parseSignedCents(cell(map.credit), options.numberFormat);
    if (debit) {
      amountCents = Math.abs(debit);
    } else if (credit) {
      amountCents = Math.abs(credit);
      direction = 'credit';
    }
  } else {
    const n = parseSignedCents(cell(map.amount), options.numberFormat);
    if (n) {
      amountCents = Math.abs(n);
      if (options.convention === 'type_col') direction = /^(c|cr|cred|créd|h|haber)/i.test(cell(map.type) ?? '') ? 'credit' : 'debit';
      else if (options.convention === 'neg_debit') direction = n < 0 ? 'debit' : 'credit';
      else direction = n < 0 ? 'credit' : 'debit';
    }
  }
  // A dollar-only line (no amount in the local column) is converted at the statement's rate.
  let original: NormalizedRow['original'] = null;
  if (!amountCents && options.usdRate && options.usdRate > 0 && map.usd >= 0) {
    const usd = parseSignedCents(cell(map.usd), options.numberFormat);
    if (usd) {
      amountCents = Math.round(Math.abs(usd) * options.usdRate);
      original = { currency: 'USD', amountCents: Math.abs(usd), rate: String(options.usdRate) };
      if (options.convention === 'neg_debit') direction = usd < 0 ? 'debit' : 'credit';
      else if (options.convention === 'neg_credit') direction = usd < 0 ? 'credit' : 'debit';
    }
  }
  if (flipped) direction = direction === 'debit' ? 'credit' : 'debit';
  const installment = cell(map.installment)?.match(/(\d{1,2})\s*(?:\/|de|of)\s*(\d{1,2})/i);
  return {
    date: parseCsvDate(cell(map.date), options.dateFormat),
    description: (cell(map.description) ?? '').replace(/\s+/g, ' ').trim(),
    amountCents,
    direction,
    installment: installment ? `${installment[1]}/${installment[2]}` : null,
    original,
  };
}
