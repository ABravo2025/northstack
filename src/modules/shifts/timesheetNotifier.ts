import type { Timesheet } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import i18n, { resolveEmailLocale } from '../../lib/i18n.js';
import { sendTimesheetReturnedEmail } from '../../lib/mailer.js';
import { createNotification } from '../notifications/notificationService.js';
import { APPROVE_TIMESHEETS } from '../auth/roleService.js';
import type { TimesheetEmployee } from './timesheetService.js';

// Shifts module, Unidad 9 — who hears about a timesheet. Submitting tells whoever can approve it
// (bell only: they see the queue in Approvals). A decision tells the person (bell; a returned week
// also gets an email, since they have something to fix). Best-effort: never fails the action.

const appBaseUrl = () => process.env.APP_BASE_URL ?? 'http://localhost:5173';
const userSelect = { id: true, email: true, firstName: true, locale: true, status: true } as const;

const t = (locale: string | null | undefined, key: string, opts: Record<string, unknown> = {}) =>
  i18n.t(`timesheet.${key}`, { lng: resolveEmailLocale(locale), ns: 'emails', ...opts });

// "Oct 12" / "12 oct" — a week is named by its first day.
export function formatWeek(weekStart: Date, locale: string | null | undefined): string {
  const lng = resolveEmailLocale(locale);
  return weekStart.toLocaleDateString(lng === 'es' ? 'es-AR' : 'en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// Owner role, anyone with approve_timesheets, and the person's direct manager — never the person.
export async function approverRecipients(employee: TimesheetEmployee) {
  const manager = employee.managerId
    ? await prisma.employee.findUnique({ where: { id: employee.managerId }, select: { userId: true } })
    : null;
  const users = await prisma.user.findMany({
    where: {
      tenantId: employee.tenantId,
      status: 'active',
      OR: [
        { roleRef: { OR: [{ isOwner: true }, { modulePermissions: { some: { permission: APPROVE_TIMESHEETS } } }] } },
        ...(manager?.userId ? [{ id: manager.userId }] : []),
      ],
    },
    select: userSelect,
  });
  return users.filter((u) => u.id !== employee.userId);
}

export async function notifySubmitted(employee: TimesheetEmployee, timesheet: Timesheet): Promise<void> {
  try {
    const name = `${employee.firstName} ${employee.lastName}`;
    for (const u of await approverRecipients(employee)) {
      await createNotification({
        tenantId: employee.tenantId,
        userId: u.id,
        type: 'timesheet_submitted',
        entityType: 'timesheet',
        entityId: timesheet.id,
        message: t(u.locale, 'notifSubmitted', { employeeName: name, week: formatWeek(timesheet.weekStart, u.locale) }),
      });
    }
  } catch (err) {
    console.error('notifySubmitted failed:', err);
  }
}

export async function notifyDecided(employee: TimesheetEmployee, timesheet: Timesheet, deciderName: string): Promise<void> {
  try {
    if (!employee.userId) return;
    const u = await prisma.user.findUnique({ where: { id: employee.userId }, select: userSelect });
    if (!u || u.status !== 'active') return;
    const week = formatWeek(timesheet.weekStart, u.locale);
    const key = timesheet.status === 'approved' ? 'notifApproved' : timesheet.status === 'returned' ? 'notifReturned' : 'notifReopened';
    await createNotification({
      tenantId: employee.tenantId,
      userId: u.id,
      type: 'timesheet_decided',
      entityType: 'timesheet',
      entityId: timesheet.id,
      message: t(u.locale, key, { week, name: deciderName }),
    });
    if (timesheet.status === 'returned' || timesheet.status === 'open') {
      const tenant = await prisma.tenant.findUnique({ where: { id: employee.tenantId }, select: { name: true } });
      await sendTimesheetReturnedEmail({
        to: u.email,
        locale: u.locale,
        firstName: u.firstName,
        companyName: tenant?.name ?? '',
        week,
        deciderName,
        note: timesheet.status === 'returned' ? timesheet.decisionNote : timesheet.reopenReason,
        reopened: timesheet.status === 'open',
        url: `${appBaseUrl()}/shifts/timesheet?week=${timesheet.weekStart.toISOString().slice(0, 10)}`,
      });
    }
  } catch (err) {
    console.error('notifyDecided failed:', err);
  }
}
