import { describe, expect, it } from 'vitest';
import {
  detectConvention,
  guessColumns,
  guessDateFormat,
  guessNumberFormat,
  normalizeRow,
  parseCsv,
  parseCsvDate,
  parseSignedCents,
} from '../frontend/src/lib/expenseCsv';

// The browser-side CSV reader of the Gastos import wizard (A4). The file itself never reaches the
// server, so these are the only checks its contents get before rows are normalized.

const visa = 'Fecha;Descripción;Cuotas;Importe ARS\n02/10/2026;MERPAGO*DISTRIBUIDORA LOPEZ;;84.500,00\n05/10/2026;SU PAGO EN PESOS;;-1.250.000,00\n09/10/2026;MERCADOLIBRE*NOTEBOOK;03/12;145.833,33\n12/10/2026;BONIFICACION PROMO;;-5.000,00';
const santander = 'Fecha;Concepto;Importe;Saldo\n01/10/2026;TRANSF RECIBIDA - ATLAS;1.800.000,00;3.420.000,00\n04/10/2026;DEBITO AUTOMATICO EDESUR;-56.300,00;3.363.700,00\n10/10/2026;COMISION MANTENIMIENTO CUENTA;-18.500,00;1.247.500,00';

describe('parseCsv', () => {
  it('picks the delimiter and handles quotes, escaped quotes and a BOM', () => {
    expect(parseCsv('﻿a,b\n"x, y","say ""hi"""\r\n\n1,2')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['1', '2'],
    ]);
    expect(parseCsv(visa)[0]).toEqual(['Fecha', 'Descripción', 'Cuotas', 'Importe ARS']);
  });
});

describe('numbers and dates', () => {
  it('reads AR and US amounts, parentheses and trailing minus', () => {
    expect(parseSignedCents('1.250.000,00', 'ar')).toBe(125000000);
    expect(parseSignedCents('-56.300,00', 'ar')).toBe(-5630000);
    expect(parseSignedCents('$ 1,234.56', 'us')).toBe(123456);
    expect(parseSignedCents('(500,00)', 'ar')).toBe(-50000);
    expect(parseSignedCents('500,00-', 'ar')).toBe(-50000);
    expect(parseSignedCents('abc', 'ar')).toBeNull();
    expect(parseSignedCents('', 'ar')).toBeNull();
  });

  it('reads dmy/mdy/ymd dates and rejects impossible ones', () => {
    expect(parseCsvDate('05/10/2026', 'dmy')).toBe('2026-10-05');
    expect(parseCsvDate('10/05/26', 'mdy')).toBe('2026-10-05');
    expect(parseCsvDate('2026-10-05 14:32', 'ymd')).toBe('2026-10-05');
    expect(parseCsvDate('31/02/2026', 'dmy')).toBeNull();
  });

  it('guesses the date and number format from the cells', () => {
    expect(guessDateFormat(['13/10/2026', '02/10/2026'])).toBe('dmy');
    expect(guessDateFormat(['2026-10-13'])).toBe('ymd');
    expect(guessDateFormat(['10/13/2026'])).toBe('mdy');
    expect(guessNumberFormat(['1.250,00', '-56.300,00'])).toBe('ar');
    expect(guessNumberFormat(['1,250.00', '-56.30'])).toBe('us');
  });
});

describe('sign convention', () => {
  it('on a card statement, "−" on payments and bonuses means credit', () => {
    const [headers, ...rows] = parseCsv(visa);
    const map = guessColumns(headers);
    expect(map).toMatchObject({ date: 0, description: 1, installment: 2, amount: 3 });
    const d = detectConvention(rows, map, 'ar', { isCard: true });
    expect(d).toMatchObject({ convention: 'neg_credit', reason: 'negCredit' });
    const purchase = normalizeRow(rows[2], map, { numberFormat: 'ar', dateFormat: 'dmy', convention: d.convention });
    expect(purchase).toEqual({ date: '2026-10-09', description: 'MERCADOLIBRE*NOTEBOOK', amountCents: 14583333, direction: 'debit', installment: '03/12', original: null });
    expect(normalizeRow(rows[1], map, { numberFormat: 'ar', dateFormat: 'dmy', convention: d.convention }).direction).toBe('credit');
  });

  it('on a bank account, "−" on debits, fees and taxes means expense; the balance column is ignored', () => {
    const [headers, ...rows] = parseCsv(santander);
    const map = guessColumns(headers);
    expect(map.amount).toBe(2);
    const d = detectConvention(rows, map, 'ar', { isCard: false });
    expect(d.convention).toBe('neg_debit');
    const opts = { numberFormat: 'ar' as const, dateFormat: 'dmy' as const, convention: d.convention };
    expect(normalizeRow(rows[1], map, opts)).toMatchObject({ amountCents: 5630000, direction: 'debit' });
    expect(normalizeRow(rows[0], map, opts).direction).toBe('credit');
    expect(normalizeRow(rows[0], map, opts, true).direction).toBe('debit');
  });

  it('uses separate Debit/Credit columns when the file has them', () => {
    const [headers, ...rows] = parseCsv('Date,Description,Debit,Credit\n2026-10-05,AWS,91.30,\n2026-10-06,Refund,,12.00');
    const map = guessColumns(headers);
    expect(detectConvention(rows, map, 'us', { isCard: false }).convention).toBe('cols');
    const opts = { numberFormat: 'us' as const, dateFormat: 'ymd' as const, convention: 'cols' as const };
    expect(normalizeRow(rows[0], map, opts)).toMatchObject({ amountCents: 9130, direction: 'debit' });
    expect(normalizeRow(rows[1], map, opts)).toMatchObject({ amountCents: 1200, direction: 'credit' });
  });

  it('converts a dollar-only line at the statement rate and keeps the original', () => {
    const [headers, ...rows] = parseCsv(['Fecha;Descripción;Importe ARS;Importe U$S', '05/10/2026;AWS EMEA;;91,30', '06/10/2026;YPF;38.200,00;'].join(String.fromCharCode(10)));
    const map = guessColumns(headers);
    expect(map).toMatchObject({ amount: 2, usd: 3 });
    const opts = { numberFormat: 'ar' as const, dateFormat: 'dmy' as const, convention: 'neg_credit' as const, usdRate: 1047.19 };
    expect(normalizeRow(rows[0], map, opts)).toMatchObject({ amountCents: 9560845, direction: 'debit', original: { currency: 'USD', amountCents: 9130, rate: '1047.19' } });
    expect(normalizeRow(rows[1], map, opts)).toMatchObject({ amountCents: 3820000, original: null });
  });
});
