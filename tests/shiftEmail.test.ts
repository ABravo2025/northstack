import { beforeAll, describe, expect, it, vi } from 'vitest';

// Capture what would go out over SMTP instead of sending it.
const sent: any[] = [];
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: async (opts: unknown) => { sent.push(opts); return {}; } }) },
}));

let sendShiftEmail: typeof import('../src/lib/mailer.js').sendShiftEmail;
let formatShiftWhen: typeof import('../src/modules/shifts/shiftNotifier.js').formatShiftWhen;
let buildIcs: typeof import('../src/modules/shifts/shiftIcs.js').buildIcs;

beforeAll(async () => {
  process.env.ZOHO_SMTP_USER = 'no-reply@example.test';
  process.env.ZOHO_SMTP_PASSWORD = 'x';
  ({ sendShiftEmail } = await import('../src/lib/mailer.js'));
  ({ formatShiftWhen } = await import('../src/modules/shifts/shiftNotifier.js'));
  ({ buildIcs } = await import('../src/modules/shifts/shiftIcs.js'));
  // shiftNotifier pulls in googleapis, which is slow to load the first time.
}, 60_000);

const shift = { date: new Date('2026-10-12T00:00:00Z'), startMinute: 420, endMinute: 690 };

describe('formatShiftWhen', () => {
  it('formats in the recipient language and marks overnight shifts', () => {
    expect(formatShiftWhen(shift, 'en')).toBe('Mon, Oct 12 · 07:00–11:30');
    expect(formatShiftWhen(shift, 'es')).toMatch(/^lun.*12.*oct.* · 07:00–11:30$/);
    expect(formatShiftWhen({ ...shift, startMinute: 1320, endMinute: 360 }, 'en')).toBe('Mon, Oct 12 · 22:00–06:00 (ends the next day)');
  });
});

describe('sendShiftEmail', () => {
  it('one email for a batch, with answer buttons and the .ics attached', async () => {
    sent.length = 0;
    await sendShiftEmail({
      to: 'mia@example.test',
      locale: 'en',
      kind: 'assigned',
      firstName: 'Mia',
      companyName: 'Lab <Andes>',
      shifts: [
        { when: 'Mon, Oct 12 · 07:00–11:30', location: 'Lab Central', address: 'Av. Corrientes 4120', position: 'Analysis', acceptUrl: 'https://app/x?answer=accepted', declineUrl: 'https://app/x?answer=declined' },
        { when: 'Tue, Oct 13 · 07:00–11:30', location: 'Lab Central', acceptUrl: 'https://app/y?answer=accepted', declineUrl: 'https://app/y?answer=declined' },
      ],
      scheduleUrl: 'https://app/shifts/mine',
      ics: buildIcs([{ uid: 'u1', sequence: 1, startsAt: new Date('2026-10-12T10:00:00Z'), endsAt: new Date('2026-10-12T14:30:00Z'), summary: 'Shift' }]),
    });
    expect(sent).toHaveLength(1);
    const mail = sent[0];
    expect(mail.subject).toBe('You have 2 new shifts');
    expect(mail.html).toContain('Lab &lt;Andes&gt;'); // tenant name escaped
    expect(mail.html).toContain('https://app/x?answer=accepted');
    expect(mail.html).toContain('https://app/y?answer=declined');
    expect(mail.text).toContain("I'll be there: https://app/x?answer=accepted");
    expect(mail.attachments[0].filename).toBe('shift.ics');
    expect(mail.attachments[0].contentType).toContain('method=PUBLISH');
  });

  it('Spanish, cancellation: no answer buttons, CANCEL method', async () => {
    sent.length = 0;
    await sendShiftEmail({
      to: 'mia@example.test',
      locale: 'es',
      kind: 'cancelled',
      firstName: 'Mia',
      companyName: 'Lab',
      shifts: [{ when: 'lun 12 oct · 07:00–11:30', location: 'Lab Central' }],
      ics: buildIcs([{ uid: 'u1', sequence: 2, startsAt: new Date(), endsAt: new Date(), summary: 'x', cancelled: true }]),
    });
    expect(sent[0].subject).toBe('Turno cancelado: lun 12 oct · 07:00–11:30');
    expect(sent[0].text).toContain('No hace falta que vayas');
    expect(sent[0].html).not.toContain('answer=');
    expect(sent[0].attachments[0].contentType).toContain('method=CANCEL');
  });

  it('decline notice to the manager carries the reason', async () => {
    sent.length = 0;
    await sendShiftEmail({
      to: 'boss@example.test',
      locale: 'en',
      kind: 'declined',
      firstName: 'Lucia',
      companyName: 'Lab',
      employeeName: 'Mia Member',
      reason: 'Exam that morning',
      shifts: [{ when: 'Mon, Oct 12 · 07:00–11:30', location: 'Lab Central' }],
    });
    expect(sent[0].subject).toBe("Mia Member can't make the shift on Mon, Oct 12 · 07:00–11:30");
    expect(sent[0].text).toContain('Reason: Exam that morning');
    expect(sent[0].attachments).toBeUndefined();
  });
});
