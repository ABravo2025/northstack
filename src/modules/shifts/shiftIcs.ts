// Shifts module, Unidad 4 — the .ics file attached to shift emails, so the shift lands in any
// calendar app (Google, Outlook, Apple) even for people who never connected Google Calendar.
// RFC 5545, hand-written (no library in the project, and the subset needed is small).
//
// The UID is stable per assignment, so a later email about the same shift (changed, cancelled)
// updates or removes the same calendar entry instead of adding a second one; SEQUENCE must grow
// with every version for clients to accept the update, so callers pass a monotonic number.

export interface IcsEvent {
  uid: string;
  sequence: number;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  location?: string | null;
  description?: string | null;
  cancelled?: boolean;
}

// TEXT escaping (RFC 5545 §3.3.11): backslash, semicolon, comma and newlines.
export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// 20261012T100000Z
export function formatIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Lines longer than 75 octets are folded: CRLF + one space, counting UTF-8 bytes (accented text
// must not be split mid-character).
export function foldIcsLine(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, 'utf8');
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

export function buildIcs(events: IcsEvent[], now: Date = new Date()): string {
  const cancelled = events.length > 0 && events.every((e) => e.cancelled);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Northstack//Shifts//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${cancelled ? 'CANCEL' : 'PUBLISH'}`,
  ];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `SEQUENCE:${e.sequence}`,
      `DTSTAMP:${formatIcsUtc(now)}`,
      `DTSTART:${formatIcsUtc(e.startsAt)}`,
      `DTEND:${formatIcsUtc(e.endsAt)}`,
      `SUMMARY:${escapeIcsText(e.summary)}`,
    );
    if (e.location) lines.push(`LOCATION:${escapeIcsText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeIcsText(e.description)}`);
    lines.push(`STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

export function shiftEventUid(assignmentId: string): string {
  return `shift-${assignmentId}@joinnorthstack.com`;
}
