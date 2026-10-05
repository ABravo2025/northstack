import prisma from '../../lib/prisma.js';
import type { EmployeeAvailability } from '@prisma/client';
import { isValidDateString } from './shiftTime.js';

// Shifts module, Unidad 6 (spec-shifts.md §1) — when each person says they can or can't work.
// Either recurring (every Monday 08:00–14:00) or for one date (free this Saturday). Shift
// assignment reads these as warnings (shiftRules.ts), never as blocks: people's plans change.
// Each person edits only their own rows.

const MAX_NOTE = 200;
const MAX_ROWS_PER_PERSON = 100;

type Result<T> = { success: true; value: T } | { success: false; error: string; field?: string };

export interface AvailabilityInput {
  weekday?: unknown;
  date?: unknown;
  startMinute?: unknown;
  endMinute?: unknown;
  kind?: unknown;
  note?: unknown;
}

export interface ParsedAvailability {
  weekday: number | null;
  date: string | null;
  startMinute: number;
  endMinute: number;
  kind: 'available' | 'unavailable';
  note: string | null;
}

// A row is one stretch within a single day; ending at 24:00 (1440) is allowed so "until
// midnight" can be said. Something overnight is two rows.
export function parseAvailabilityInput(input: AvailabilityInput): Result<ParsedAvailability> {
  const hasWeekday = input.weekday !== undefined && input.weekday !== null;
  const hasDate = input.date !== undefined && input.date !== null;
  if (hasWeekday === hasDate) return { success: false, error: 'Pick either a weekday or a date' };
  if (hasWeekday && (typeof input.weekday !== 'number' || !Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6)) {
    return { success: false, error: 'Invalid weekday', field: 'weekday' };
  }
  if (hasDate && !isValidDateString(input.date)) return { success: false, error: 'Invalid date', field: 'date' };
  const { startMinute, endMinute } = input;
  if (typeof startMinute !== 'number' || !Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439) {
    return { success: false, error: 'Invalid start time', field: 'startMinute' };
  }
  if (typeof endMinute !== 'number' || !Number.isInteger(endMinute) || endMinute < 1 || endMinute > 1440 || endMinute <= startMinute) {
    return { success: false, error: 'The end must be after the start', field: 'endMinute' };
  }
  if (input.kind !== 'available' && input.kind !== 'unavailable') return { success: false, error: 'Invalid kind', field: 'kind' };
  let note: string | null = null;
  if (input.note !== undefined && input.note !== null) {
    if (typeof input.note !== 'string') return { success: false, error: 'Invalid note', field: 'note' };
    note = input.note.trim().slice(0, MAX_NOTE) || null;
  }
  return {
    success: true,
    value: {
      weekday: hasWeekday ? (input.weekday as number) : null,
      date: hasDate ? (input.date as string) : null,
      startMinute,
      endMinute,
      kind: input.kind,
      note,
    },
  };
}

export function serializeAvailability(row: EmployeeAvailability) {
  return {
    id: row.id,
    weekday: row.weekday,
    date: row.date ? row.date.toISOString().slice(0, 10) : null,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    kind: row.kind,
    note: row.note,
  };
}

export async function listAvailability(tenantId: string, employeeId: string) {
  const rows = await prisma.employeeAvailability.findMany({
    where: { tenantId, employeeId },
    orderBy: [{ weekday: 'asc' }, { date: 'asc' }, { startMinute: 'asc' }],
  });
  return rows.map(serializeAvailability);
}

export async function createAvailability(tenantId: string, employeeId: string, input: AvailabilityInput): Promise<Result<ReturnType<typeof serializeAvailability>>> {
  const parsed = parseAvailabilityInput(input);
  if (!parsed.success) return parsed;
  if ((await prisma.employeeAvailability.count({ where: { employeeId } })) >= MAX_ROWS_PER_PERSON) {
    return { success: false, error: `You can keep up to ${MAX_ROWS_PER_PERSON} availability entries. Remove some old ones first.` };
  }
  const p = parsed.value;
  const row = await prisma.employeeAvailability.create({
    data: {
      tenantId,
      employeeId,
      weekday: p.weekday,
      date: p.date ? new Date(`${p.date}T00:00:00.000Z`) : null,
      startMinute: p.startMinute,
      endMinute: p.endMinute,
      kind: p.kind,
      note: p.note,
    },
  });
  return { success: true, value: serializeAvailability(row) };
}

// Only the person's own row; anything else reads as not found.
export async function deleteAvailability(employeeId: string, id: string): Promise<boolean> {
  const result = await prisma.employeeAvailability.deleteMany({ where: { id, employeeId } });
  return result.count > 0;
}
