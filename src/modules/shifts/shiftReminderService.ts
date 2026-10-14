import type { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import i18n, { resolveEmailLocale } from '../../lib/i18n.js';
import { sendShiftEmail, sendSkillExpiryEmail, sendTimesheetReminderEmail, type ShiftEmailShift, type SkillExpiryItem } from '../../lib/mailer.js';
import { createNotification } from '../notifications/notificationService.js';
import { getPlanLimits } from '../tenant/planLimits.js';
import { MANAGE_SHIFTS } from '../auth/roleService.js';
import { formatShiftWhen, shiftAnswerUrl } from './shiftNotifier.js';
import { getShiftsSettings, type EffectiveShiftsSettings } from './shiftsSettingsService.js';
import { newResponseToken } from './shiftService.js';
import { addDays, zonedDateString } from './shiftTime.js';
import { weekStartFor } from './timesheetService.js';
import { expireStartedRequests } from './shiftRequestService.js';
import { notifyExpired } from './shiftRequestNotifier.js';
import { autoCloseOpenEntries } from './clockService.js';
import { notifyAutoClosed } from './clockNotifier.js';

// Shifts module, Unidad 8 (spec-shifts.md §0.4) — the one daily run (Vercel Hobby = crons once a
// day). In order:
//   1. Tomorrow's shifts (settings.remindDayBefore), to everyone on them who hasn't declined.
//   2. Shifts still waiting for an answer (settings.remindUnanswered, only when the company asks
//      for confirmations), at most once a day per assignment.
//   3. Skills that expire in 30 days, in 7 days, or today (Growth), to the holder and to whoever
//      manages shifts.
//   4. Yesterday's shift hours not in the timesheet yet (timesheetEnabled + timesheetReminder).
//
// Each reminder rotates the assignment's one-click token (only its hash is stored, so the clear
// token exists only at send time), which retires the buttons of the earlier email; that page
// says the link is no longer valid and points to My shifts. lastRemindedAt keeps a second run on
// the same day (a manual re-trigger) from sending everything twice, and keeps step 2 from
// repeating what step 1 already sent.

const DAY_MS = 24 * 60 * 60 * 1000;
// Under a day, so a cron that drifts a few minutes earlier tomorrow still counts as "a day later".
const REMIND_GAP_MS = 20 * 60 * 60 * 1000;
export const SKILL_NOTICE_DAYS = [30, 7, 0] as const;

const appBaseUrl = () => process.env.APP_BASE_URL ?? 'http://localhost:5173';

const t = (locale: string | null | undefined, key: string, opts: Record<string, unknown> = {}) =>
  i18n.t(`shifts.${key}`, { lng: resolveEmailLocale(locale), ns: 'emails', ...opts });

// ---------------------------------------------------------------------------------------------
// Pure rules (tested)

// "Tomorrow" is the location's tomorrow: a shift's date is its local calendar day.
export function isTomorrowAt(shiftDate: string, now: Date, timeZone: string): boolean {
  return shiftDate === addDays(zonedDateString(now, timeZone), 1);
}

// Notified at least ~a day ago and not reminded in the last ~day.
export function isDueForReminder(a: { notifiedAt: Date | null; lastRemindedAt: Date | null }, now: Date): boolean {
  if (!a.notifiedAt || now.getTime() - a.notifiedAt.getTime() < REMIND_GAP_MS) return false;
  return !a.lastRemindedAt || now.getTime() - a.lastRemindedAt.getTime() >= REMIND_GAP_MS;
}

export function remindedRecently(lastRemindedAt: Date | null, now: Date): boolean {
  return !!lastRemindedAt && now.getTime() - lastRemindedAt.getTime() < REMIND_GAP_MS;
}

// Days from `today` to the expiry date when it's one of the notice days, else null. The expiry
// date is the last valid day (shiftRules treats a skill as expired only after it).
export function skillNoticeDay(expiresAt: string, today: string): number | null {
  const days = Math.round((Date.parse(`${expiresAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
  return (SKILL_NOTICE_DAYS as readonly number[]).includes(days) ? days : null;
}

const toDateString = (d: Date) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------------------------

// `only` narrows a run to one tenant (QA against a shared database); the cron passes nothing.
const tenantFilter = (only?: string): Prisma.TenantWhereInput => ({ status: { notIn: ['suspended', 'cancelled'] }, ...(only ? { id: only } : {}) });
const userSelect = { id: true, email: true, firstName: true, locale: true, status: true } as const;

function settingsCache() {
  const cache = new Map<string, EffectiveShiftsSettings>();
  return async (tenantId: string) => {
    const hit = cache.get(tenantId);
    if (hit) return hit;
    const settings = await getShiftsSettings(tenantId);
    cache.set(tenantId, settings);
    return settings;
  };
}

const assignmentInclude = {
  employee: { select: { user: { select: userSelect } } },
  shift: { include: { tenant: { select: { name: true } }, location: { select: { name: true, address: true, timezone: true } } } },
} satisfies Prisma.ShiftAssignmentInclude;

type ReminderAssignment = Prisma.ShiftAssignmentGetPayload<{ include: typeof assignmentInclude }>;

// Rotates the token and stamps lastRemindedAt, then sends one bell + one email per person.
async function sendReminders(kind: 'tomorrow' | 'unanswered', assignments: ReminderAssignment[], now: Date): Promise<number> {
  const byUser = new Map<string, { user: NonNullable<ReminderAssignment['employee']['user']>; items: { a: ReminderAssignment; token: string }[] }>();
  for (const a of assignments) {
    const user = a.employee.user;
    if (!user || user.status !== 'active') continue;
    const { token, hash } = newResponseToken();
    await prisma.shiftAssignment.update({ where: { id: a.id }, data: { responseTokenHash: hash, lastRemindedAt: now } });
    const entry = byUser.get(user.id) ?? { user, items: [] };
    entry.items.push({ a, token });
    byUser.set(user.id, entry);
  }

  for (const { user, items } of byUser.values()) {
    items.sort((x, y) => x.a.shift.startsAt.getTime() - y.a.shift.startsAt.getTime());
    const first = items[0].a.shift;
    const message =
      kind === 'tomorrow'
        ? items.length === 1
          ? t(user.locale, 'notifTomorrowOne', { when: formatShiftWhen(first, user.locale), location: first.location.name })
          : t(user.locale, 'notifTomorrowMany', { count: items.length })
        : t(user.locale, 'notifUnanswered', { count: items.length });
    await createNotification({ tenantId: first.tenantId, userId: user.id, type: 'shift_reminder', entityType: 'shift', entityId: first.id, message }).catch((err) =>
      console.error('Failed to create shift reminder notification:', err),
    );

    const shifts: ShiftEmailShift[] = items.map(({ a, token }) => ({
      when: formatShiftWhen(a.shift, user.locale),
      location: a.shift.location.name,
      address: a.shift.location.address,
      position: a.shift.position,
      notes: a.shift.notes,
      acceptUrl: a.status === 'pending' ? shiftAnswerUrl(token, 'accepted') : null,
      declineUrl: shiftAnswerUrl(token, 'declined'),
    }));
    await sendShiftEmail({
      to: user.email,
      locale: user.locale,
      kind,
      firstName: user.firstName,
      companyName: first.tenant.name,
      shifts,
      scheduleUrl: `${appBaseUrl()}/shifts/mine`,
    });
  }
  return [...byUser.values()].reduce((n, e) => n + e.items.length, 0);
}

async function remindTomorrow(now: Date, settingsFor: (id: string) => Promise<EffectiveShiftsSettings>, only?: string): Promise<number> {
  // Every timezone's "tomorrow" falls within UTC today-1 … today+2.
  const utcToday = toDateString(now);
  const candidates = await prisma.shiftAssignment.findMany({
    where: {
      status: { in: ['pending', 'accepted'] },
      notifiedAt: { not: null },
      tenant: tenantFilter(only),
      shift: {
        status: 'published',
        date: { gte: new Date(`${addDays(utcToday, -1)}T00:00:00Z`), lte: new Date(`${addDays(utcToday, 2)}T00:00:00Z`) },
      },
    },
    include: assignmentInclude,
  });
  const due: ReminderAssignment[] = [];
  for (const a of candidates) {
    if (remindedRecently(a.lastRemindedAt, now)) continue;
    if (!isTomorrowAt(toDateString(a.shift.date), now, a.shift.location.timezone)) continue;
    if (!(await settingsFor(a.tenantId)).remindDayBefore) continue;
    due.push(a);
  }
  return sendReminders('tomorrow', due, now);
}

async function remindUnanswered(now: Date, settingsFor: (id: string) => Promise<EffectiveShiftsSettings>, only?: string): Promise<number> {
  const candidates = await prisma.shiftAssignment.findMany({
    where: {
      status: 'pending',
      notifiedAt: { lte: new Date(now.getTime() - REMIND_GAP_MS) },
      tenant: tenantFilter(only),
      shift: { status: 'published', startsAt: { gt: now } },
    },
    include: assignmentInclude,
  });
  const due: ReminderAssignment[] = [];
  for (const a of candidates) {
    if (!isDueForReminder(a, now)) continue;
    const settings = await settingsFor(a.tenantId);
    if (!settings.requireConfirmation || !settings.remindUnanswered) continue;
    due.push(a);
  }
  return sendReminders('unanswered', due, now);
}

async function noticeExpiringSkills(now: Date, only?: string): Promise<{ holders: number; managers: number }> {
  const today = toDateString(now);
  const dates = SKILL_NOTICE_DAYS.map((d) => new Date(`${addDays(today, d)}T00:00:00Z`));
  const rows = await prisma.employeeSkill.findMany({
    where: { expiresAt: { in: dates }, skill: { isActive: true }, tenant: tenantFilter(only) },
    include: {
      skill: { select: { id: true, name: true } },
      employee: { select: { firstName: true, lastName: true, user: { select: userSelect } } },
      tenant: { select: { id: true, name: true, plan: true, planOverride: true } },
    },
    orderBy: { expiresAt: 'asc' },
  });

  const byTenant = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!getPlanLimits(r.tenant, now).shiftSkillsEnabled) continue;
    byTenant.set(r.tenantId, [...(byTenant.get(r.tenantId) ?? []), r]);
  }

  let holders = 0;
  let managers = 0;
  // Skill notices have no row of their own to stamp, so a same-day re-run is caught by the bell
  // notifications an earlier run left (read before this run sends anything).
  const since = new Date(now.getTime() - REMIND_GAP_MS);
  const settingsUrl = `${appBaseUrl()}/settings/shifts`;
  for (const [tenantId, list] of byTenant) {
    const companyName = list[0].tenant.name;
    const earlier = await prisma.notification.findMany({
      where: { tenantId, type: 'skill_expiring', createdAt: { gte: since } },
      select: { userId: true },
      distinct: ['userId'],
    });
    const noticedToday = new Set(earlier.map((n) => n.userId));
    const item = (r: (typeof list)[number], withPerson: boolean): SkillExpiryItem => ({
      skill: r.skill.name,
      person: withPerson ? `${r.employee.firstName} ${r.employee.lastName}` : null,
      expiresOn: toDateString(r.expiresAt as Date),
      daysLeft: skillNoticeDay(toDateString(r.expiresAt as Date), today) ?? 0,
    });

    // The holder: one bell + one email with their own skills.
    const perHolder = new Map<string, typeof list>();
    for (const r of list) {
      const u = r.employee.user;
      if (!u || u.status !== 'active') continue;
      perHolder.set(u.id, [...(perHolder.get(u.id) ?? []), r]);
    }
    for (const own of perHolder.values()) {
      const u = own[0].employee.user!;
      if (noticedToday.has(u.id)) continue;
      await createNotification({
        tenantId,
        userId: u.id,
        type: 'skill_expiring',
        entityType: 'skill',
        entityId: own[0].skill.id,
        message: t(u.locale, 'notifSkillOwn', { count: own.length, skill: own[0].skill.name }),
      }).catch((err) => console.error('Failed to create skill expiry notification:', err));
      await sendSkillExpiryEmail({ to: u.email, locale: u.locale, firstName: u.firstName, companyName, items: own.map((r) => item(r, false)), forManager: false, url: null });
      holders++;
    }

    // Whoever manages shifts (owner role, or a role with manage_shifts): one digest.
    const recipients = await prisma.user.findMany({
      where: {
        tenantId,
        status: 'active',
        roleRef: { OR: [{ isOwner: true }, { modulePermissions: { some: { permission: MANAGE_SHIFTS } } }] },
      },
      select: userSelect,
    });
    for (const u of recipients) {
      if (noticedToday.has(u.id)) continue;
      await createNotification({
        tenantId,
        userId: u.id,
        type: 'skill_expiring',
        entityType: 'skill',
        entityId: list[0].skill.id,
        message: t(u.locale, 'notifSkillTeam', { count: list.length }),
      }).catch((err) => console.error('Failed to create skill expiry notification:', err));
      await sendSkillExpiryEmail({ to: u.email, locale: u.locale, firstName: u.firstName, companyName, items: list.map((r) => item(r, true)), forManager: true, url: settingsUrl });
      managers++;
    }
  }
  return { holders, managers };
}

// Unidad 9: yesterday's accepted shifts (the location's yesterday) whose hours aren't in the
// timesheet yet, when the company has timesheets and their reminder on. Skips shifts already logged
// or dismissed, and weeks already submitted or approved. One bell + one email per person.
async function remindTimesheet(now: Date, settingsFor: (id: string) => Promise<EffectiveShiftsSettings>, only?: string): Promise<number> {
  const utcToday = toDateString(now);
  const candidates = await prisma.shiftAssignment.findMany({
    where: {
      status: 'accepted',
      tenant: tenantFilter(only),
      shift: {
        status: 'published',
        endsAt: { lte: now },
        date: { gte: new Date(`${addDays(utcToday, -2)}T00:00:00Z`), lte: new Date(`${utcToday}T00:00:00Z`) },
      },
    },
    include: assignmentInclude,
  });

  const byUser = new Map<string, { user: NonNullable<ReminderAssignment['employee']['user']>; items: ReminderAssignment[] }>();
  for (const a of candidates) {
    const user = a.employee.user;
    if (!user || user.status !== 'active') continue;
    const date = toDateString(a.shift.date);
    if (date !== addDays(zonedDateString(now, a.shift.location.timezone), -1)) continue;
    const settings = await settingsFor(a.tenantId);
    if (!settings.timesheetEnabled || !settings.timesheetReminder) continue;

    const [logged, dismissed, week] = await Promise.all([
      prisma.timeEntry.count({ where: { employeeId: a.employeeId, source: 'shift', sourceId: a.id } }),
      prisma.timeSuggestionDismissal.count({ where: { employeeId: a.employeeId, sourceType: 'shift', sourceId: a.id } }),
      prisma.timesheet.findUnique({
        where: { employeeId_weekStart: { employeeId: a.employeeId, weekStart: new Date(`${weekStartFor(date, settings.weekStartsOn)}T00:00:00Z`) } },
        select: { status: true },
      }),
    ]);
    if (logged > 0 || dismissed > 0) continue;
    if (week && (week.status === 'submitted' || week.status === 'approved')) continue;

    const entry = byUser.get(user.id) ?? { user, items: [] };
    entry.items.push(a);
    byUser.set(user.id, entry);
  }

  const since = new Date(now.getTime() - REMIND_GAP_MS);
  let sent = 0;
  for (const { user, items } of byUser.values()) {
    const tenantId = items[0].tenantId;
    const already = await prisma.notification.count({ where: { tenantId, userId: user.id, type: 'timesheet_reminder', createdAt: { gte: since } } });
    if (already > 0) continue;
    items.sort((x, y) => x.shift.startsAt.getTime() - y.shift.startsAt.getTime());
    const week = weekStartFor(toDateString(items[0].shift.date), (await settingsFor(tenantId)).weekStartsOn);
    await createNotification({
      tenantId,
      userId: user.id,
      type: 'timesheet_reminder',
      entityType: 'timesheet',
      entityId: items[0].id,
      message: i18n.t('timesheet.notifReminder', { lng: resolveEmailLocale(user.locale), ns: 'emails', count: items.length }),
    }).catch((err) => console.error('Failed to create timesheet reminder notification:', err));
    await sendTimesheetReminderEmail({
      to: user.email,
      locale: user.locale,
      firstName: user.firstName,
      companyName: items[0].shift.tenant.name,
      shifts: items.map((a) => `${formatShiftWhen(a.shift, user.locale)} · ${a.shift.location.name}`),
      url: `${appBaseUrl()}/shifts/timesheet?week=${week}`,
    });
    sent++;
  }
  return sent;
}

export interface ShiftReminderRunResult {
  tomorrow: number;
  unanswered: number;
  skillHolders: number;
  skillManagers: number;
  timesheet: number;
  expiredRequests: number;
  autoClosedPunches: number;
}

export async function runShiftReminders(now: Date = new Date(), only?: string): Promise<ShiftReminderRunResult> {
  const settingsFor = settingsCache();
  // Each step on its own: one failing must not stop the others.
  const step = async <T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      console.error(`Shift reminders: ${name} failed:`, err);
      return fallback;
    }
  };
  const tomorrow = await step('tomorrow', () => remindTomorrow(now, settingsFor, only), 0);
  const unanswered = await step('unanswered', () => remindUnanswered(now, settingsFor, only), 0);
  const skills = await step('skills', () => noticeExpiringSkills(now, only), { holders: 0, managers: 0 });
  const timesheet = await step('timesheet', () => remindTimesheet(now, settingsFor, only), 0);
  // Phase 2: claims, hand-overs and swaps whose shift already started are closed and their people told.
  const expiredRequests = await step(
    'expired requests',
    async () => {
      const expired = await expireStartedRequests(now, only);
      await notifyExpired(expired);
      return expired.length;
    },
    0,
  );
  // Phase 2, block B: punches nobody closed are closed at the shift's end and flagged for review.
  const autoClosedPunches = await step(
    'auto-close punches',
    async () => {
      const closed = await autoCloseOpenEntries(now, only);
      await notifyAutoClosed(closed);
      return closed.length;
    },
    0,
  );
  return { tomorrow, unanswered, skillHolders: skills.holders, skillManagers: skills.managers, timesheet, expiredRequests, autoClosedPunches };
}
