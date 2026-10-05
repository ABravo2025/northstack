import type { NotificationType, UserStatus } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import i18n, { resolveEmailLocale } from '../../lib/i18n.js';
import { sendShiftEmail, type ShiftEmailKind, type ShiftEmailShift } from '../../lib/mailer.js';
import { removeShiftCalendarEvent, upsertShiftCalendarEvent } from '../integrations/googleCalendarSyncService.js';
import { createNotification } from '../notifications/notificationService.js';
import type { ShiftEvent } from './shiftEvents.js';
import { buildIcs, shiftEventUid, type IcsEvent } from './shiftIcs.js';
import { endsNextDay, formatMinute } from './shiftTime.js';

// Shifts module, Unidad 4 (spec-shifts.md) — delivers ShiftEvents: an in-app notification (in
// the recipient's own language, unlike the older English-only notifications), an email with
// one-click answer buttons and a .ics attachment, and the event on the assignee's Google Calendar
// when they connected one. Everything here is best-effort: a delivery failure must never fail the
// shift change that caused it, so dispatchShiftEvents never throws.

const appBaseUrl = () => process.env.APP_BASE_URL ?? 'http://localhost:5173';
export const shiftAnswerUrl = (token: string, answer: 'accepted' | 'declined') => `${appBaseUrl()}/shift-response/${token}?answer=${answer}`;
const scheduleUrl = () => `${appBaseUrl()}/shifts`;
const myShiftsUrl = () => `${appBaseUrl()}/shifts/mine`;

type LoadedShift = NonNullable<Awaited<ReturnType<typeof loadShift>>>;

function loadShift(id: string) {
  return prisma.shift.findUnique({
    where: { id },
    include: {
      tenant: { select: { name: true } },
      location: { select: { name: true, address: true, timezone: true, managerEmployee: { select: { user: { select: { id: true, email: true, firstName: true, locale: true, status: true } } } } } },
      createdBy: { select: { id: true, email: true, firstName: true, locale: true, status: true } },
      assignments: { include: { employee: { select: { firstName: true, lastName: true, user: { select: { id: true, email: true, firstName: true, locale: true, status: true } } } } } },
    },
  });
}

// "Mon, Oct 12 · 07:00–11:30" in the recipient's language. The date is the location's local
// calendar day (stored as UTC midnight), so it's formatted in UTC to avoid shifting it.
export function formatShiftWhen(shift: { date: Date; startMinute: number; endMinute: number }, locale: string | null | undefined): string {
  const lng = resolveEmailLocale(locale);
  const day = shift.date.toLocaleDateString(lng === 'es' ? 'es-AR' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const next = endsNextDay(shift.startMinute, shift.endMinute) ? ` ${i18n.t('shifts.endsNextDay', { lng, ns: 'emails' })}` : '';
  return `${day} · ${formatMinute(shift.startMinute)}–${formatMinute(shift.endMinute)}${next}`;
}

const t = (locale: string | null | undefined, key: string, opts: Record<string, unknown> = {}) =>
  i18n.t(`shifts.${key}`, { lng: resolveEmailLocale(locale), ns: 'emails', ...opts });

function shiftLabel(shift: LoadedShift): string {
  return shift.position ?? shift.location.name;
}

function icsEventFor(shift: LoadedShift, assignmentId: string, locale: string | null, cancelled = false): IcsEvent {
  return {
    uid: shiftEventUid(assignmentId),
    // Must grow with every version so calendar apps accept the update; seconds since epoch do.
    sequence: Math.floor(Date.now() / 1000),
    startsAt: shift.startsAt,
    endsAt: shift.endsAt,
    summary: t(locale, 'eventSummary', { label: shiftLabel(shift) }),
    location: [shift.location.name, shift.location.address].filter(Boolean).join(', '),
    description: [shift.notes, t(locale, 'eventDescriptionLink', { url: myShiftsUrl() })].filter(Boolean).join('\n\n'),
    cancelled,
  };
}

const NOTIFICATION_TYPE: Record<ShiftEvent['kind'], NotificationType> = {
  assigned: 'shift_assigned',
  reconfirm: 'shift_assigned',
  changed: 'shift_changed',
  cancelled: 'shift_cancelled',
  unassigned: 'shift_cancelled',
  declined: 'shift_declined',
};

const NOTIFICATION_KEY: Record<ShiftEvent['kind'], string> = {
  assigned: 'notifAssigned',
  reconfirm: 'notifReconfirm',
  changed: 'notifChanged',
  cancelled: 'notifCancelled',
  unassigned: 'notifUnassigned',
  declined: 'notifDeclined',
};

type Recipient = { id: string; email: string; firstName: string; locale: string | null; status: UserStatus };

async function notifyAssignee(shift: LoadedShift, event: ShiftEvent, recipient: Recipient) {
  const isRemoval = event.kind === 'cancelled' || event.kind === 'unassigned';
  await createNotification({
    tenantId: shift.tenantId,
    userId: recipient.id,
    type: NOTIFICATION_TYPE[event.kind],
    entityType: 'shift',
    entityId: shift.id,
    message: t(recipient.locale, NOTIFICATION_KEY[event.kind], { when: formatShiftWhen(shift, recipient.locale), location: shift.location.name }),
  }).catch((err) => console.error('Failed to create shift notification:', err));

  // The answer links: accept + decline while an answer is pending, only "can't make it" once
  // accepted (or when the company doesn't ask for confirmations). None for removals, or for
  // changes that didn't rotate the token (the old one still works for those).
  const assignment = event.assignmentId ? shift.assignments.find((a) => a.id === event.assignmentId) : undefined;
  const token = event.responseToken;
  const emailShift: ShiftEmailShift = {
    when: formatShiftWhen(shift, recipient.locale),
    location: shift.location.name,
    address: shift.location.address,
    position: shift.position,
    notes: shift.notes,
    acceptUrl: token && assignment?.status === 'pending' ? shiftAnswerUrl(token, 'accepted') : null,
    declineUrl: token ? shiftAnswerUrl(token, 'declined') : null,
  };
  // Same UID as the original invite (an unassignment carries the deleted assignment's id), so a
  // cancellation replaces that calendar entry instead of adding a second one.
  const uidKey = event.assignmentId ?? `${shift.id}-${event.employeeId}`;
  return { emailShift, icsEvent: icsEventFor(shift, uidKey, recipient.locale, isRemoval) };
}

async function syncCalendar(shift: LoadedShift, event: ShiftEvent, recipient: Recipient) {
  if (event.kind === 'unassigned') {
    for (const c of event.calendarEvents ?? []) await removeShiftCalendarEvent(c.userId, c.googleCalendarEventId);
    return;
  }
  if (!event.assignmentId) return;
  if (event.kind === 'cancelled') {
    const syncs = await prisma.shiftCalendarSync.findMany({ where: { assignmentId: event.assignmentId } });
    for (const s of syncs) await removeShiftCalendarEvent(s.userId, s.googleCalendarEventId, s.id);
    return;
  }
  await upsertShiftCalendarEvent({
    tenantId: shift.tenantId,
    assignmentId: event.assignmentId,
    userId: recipient.id,
    summary: t(recipient.locale, 'eventSummary', { label: shiftLabel(shift) }),
    location: [shift.location.name, shift.location.address].filter(Boolean).join(', '),
    description: [shift.notes, t(recipient.locale, 'eventDescriptionLink', { url: myShiftsUrl() })].filter(Boolean).join('\n\n'),
    startsAt: shift.startsAt,
    endsAt: shift.endsAt,
    timeZone: shift.location.timezone,
  });
}

// Whoever should hear that someone can't make it: the location's manager and the person who
// created the shift (deduped, active logins only, never the person who declined).
function declineRecipients(shift: LoadedShift, declinerUserId: string | null): Recipient[] {
  const candidates = [shift.location.managerEmployee?.user, shift.createdBy].filter(
    (u): u is Recipient => !!u && u.status === 'active' && u.id !== declinerUserId,
  );
  return [...new Map(candidates.map((u) => [u.id, u])).values()];
}

export async function dispatchShiftEvents(events: ShiftEvent[]): Promise<void> {
  if (events.length === 0) return;
  try {
    const shifts = new Map<string, LoadedShift>();
    for (const id of new Set(events.map((e) => e.shiftId))) {
      const shift = await loadShift(id);
      if (shift) shifts.set(id, shift);
    }

    // Assignee-facing events grouped per person and kind → one email each (a published week is
    // one email, not seven). Removals use the employee's current login even though the
    // assignment row may be gone.
    const groups = new Map<string, ShiftEvent[]>();
    for (const e of events) {
      if (e.kind === 'declined') continue;
      const key = `${e.employeeId}:${e.kind}`;
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }

    for (const group of groups.values()) {
      const kind = group[0].kind as ShiftEmailKind;
      const employee = await prisma.employee.findUnique({
        where: { id: group[0].employeeId },
        select: { user: { select: { id: true, email: true, firstName: true, locale: true, status: true } } },
      });
      const recipient = employee?.user;
      if (!recipient || recipient.status !== 'active') continue;

      const emailShifts: ShiftEmailShift[] = [];
      const icsEvents: IcsEvent[] = [];
      let companyName = '';
      for (const e of group) {
        const shift = shifts.get(e.shiftId);
        if (!shift) continue;
        companyName = shift.tenant.name;
        const { emailShift, icsEvent } = await notifyAssignee(shift, e, recipient);
        emailShifts.push(emailShift);
        icsEvents.push(icsEvent);
        await syncCalendar(shift, e, recipient);
      }
      await sendShiftEmail({
        to: recipient.email,
        locale: recipient.locale,
        kind,
        firstName: recipient.firstName,
        companyName,
        shifts: emailShifts,
        scheduleUrl: myShiftsUrl(),
        ics: icsEvents.length > 0 ? buildIcs(icsEvents) : null,
      });
    }

    for (const e of events.filter((x) => x.kind === 'declined')) {
      const shift = shifts.get(e.shiftId);
      const assignment = shift?.assignments.find((a) => a.id === e.assignmentId);
      if (!shift || !assignment) continue;
      const employeeName = `${assignment.employee.firstName} ${assignment.employee.lastName}`;
      for (const r of declineRecipients(shift, assignment.employee.user?.id ?? null)) {
        await createNotification({
          tenantId: shift.tenantId,
          userId: r.id,
          type: 'shift_declined',
          entityType: 'shift',
          entityId: shift.id,
          message: t(r.locale, 'notifDeclined', { employeeName, when: formatShiftWhen(shift, r.locale), location: shift.location.name }),
        }).catch((err) => console.error('Failed to create shift notification:', err));
        await sendShiftEmail({
          to: r.email,
          locale: r.locale,
          kind: 'declined',
          firstName: r.firstName,
          companyName: shift.tenant.name,
          employeeName,
          reason: assignment.declineReason,
          shifts: [{ when: formatShiftWhen(shift, r.locale), location: shift.location.name, address: shift.location.address, position: shift.position }],
          scheduleUrl: scheduleUrl(),
        });
      }
    }
  } catch (err) {
    console.error('dispatchShiftEvents failed unexpectedly:', err);
  }
}
