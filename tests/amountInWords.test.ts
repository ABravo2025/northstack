import { describe, expect, it } from 'vitest';
import { amountInWords, englishWords, spanishWords } from '../src/modules/hr/amountInWords.js';

describe('amount in words', () => {
  it('Spanish numbers', () => {
    expect(spanishWords(0)).toBe('cero');
    expect(spanishWords(16)).toBe('dieciséis');
    expect(spanishWords(21)).toBe('veintiuno');
    expect(spanishWords(45)).toBe('cuarenta y cinco');
    expect(spanishWords(100)).toBe('cien');
    expect(spanishWords(101)).toBe('ciento uno');
    expect(spanishWords(555)).toBe('quinientos cincuenta y cinco');
    expect(spanishWords(1000)).toBe('mil');
    expect(spanishWords(21_000)).toBe('veintiún mil');
    expect(spanishWords(1_000_000)).toBe('un millón');
    expect(spanishWords(2_280_000)).toBe('dos millones doscientos ochenta mil');
    expect(spanishWords(31_501_701)).toBe('treinta y un millones quinientos un mil setecientos uno');
  });

  it('English numbers', () => {
    expect(englishWords(0)).toBe('zero');
    expect(englishWords(45)).toBe('forty-five');
    expect(englishWords(1_640)).toBe('one thousand six hundred forty');
    expect(englishWords(2_000_310)).toBe('two million three hundred ten');
  });

  it('amounts with currency and cents', () => {
    expect(amountInWords(228_000_000, 'ARS', 'es')).toBe('Dos millones doscientos ochenta mil pesos');
    expect(amountInWords(100_000_000, 'ARS', 'es')).toBe('Un millón de pesos');
    expect(amountInWords(2_100, 'ARS', 'es')).toBe('Veintiún pesos');
    expect(amountInWords(100, 'ARS', 'es')).toBe('Un peso');
    expect(amountInWords(164_050, 'USD', 'en')).toBe('One thousand six hundred forty dollars and 50/100');
    expect(amountInWords(164_050, 'USD', 'es')).toBe('Mil seiscientos cuarenta dólares estadounidenses con 50/100');
    expect(amountInWords(1_000, 'GBP', 'en')).toBe('Ten GBP');
  });
});
