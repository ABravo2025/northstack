// Minimal RFC-4180-ish CSV parser/serializer — no external dependency for
// something this small. Handles quoted fields, embedded commas, embedded
// quotes ("" escaping), and both \n and \r\n line endings.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const char = src[i];

    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop trailing fully-empty rows (common with a trailing newline in the file).
  while (rows.length > 0 && rows[rows.length - 1].every((f) => f === '')) {
    rows.pop();
  }

  return rows;
}

// Prefix values that a spreadsheet app would interpret as a formula (CSV/formula
// injection) so they open as literal text instead of executing.
const FORMULA_TRIGGER_CHARS = ['=', '+', '-', '@', '\t', '\r'];

function escapeCsvField(value: string): string {
  const safeValue = FORMULA_TRIGGER_CHARS.includes(value[0]) ? `'${value}` : value;
  if (safeValue.includes(',') || safeValue.includes('"') || safeValue.includes('\n')) {
    return `"${safeValue.replace(/"/g, '""')}"`;
  }
  return safeValue;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) => row.map((cell) => escapeCsvField(cell === null || cell === undefined ? '' : String(cell))).join(','))
    .join('\r\n');
}

// Turns a header row + data rows into an array of plain objects keyed by
// (trimmed, case-insensitive-matched) header name — the shape every CSV
// importer in this app consumes.
export function rowsToRecords(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      record[header] = (row[i] ?? '').trim();
    });
    return record;
  });
}

export function getField(record: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    for (const key of Object.keys(record)) {
      if (key.toLowerCase() === name.toLowerCase()) {
        return record[key];
      }
    }
  }
  return '';
}
