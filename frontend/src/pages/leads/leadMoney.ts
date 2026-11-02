// "12.500,50" (AR) or "12,500.50" (US) → integer cents; null when it isn't a non-negative amount.
// Same rule as the backend's parseAmountToCents: whichever separator comes last is the decimal one.
export function parseAmountInput(input: string): number | null {
  let s = input.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  if (comma > -1 && dot > -1) s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (comma > -1) s = /,\d{1,2}$/.test(s) && s.split(',').length === 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  else if (dot > -1 && !(/\.\d{1,2}$/.test(s) && s.split('.').length === 2)) s = s.replace(/\./g, '');
  const value = Number(s);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}
