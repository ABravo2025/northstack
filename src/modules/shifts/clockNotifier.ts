import prisma from '../../lib/prisma.js';
import i18n, { resolveEmailLocale } from '../../lib/i18n.js';
import { sendShiftRequestEmail } from '../../lib/mailer.js';
import { MANAGE_SHIFTS } from '../auth/roleService.js';
import { createNotification } from '../notifications/notificationService.js';
import { workedMinutes, type LoadedEntry } from './clockService.js';
import { addDays, zonedDateString } from './shiftTime.js';

// Shifts phase 2, block B — attendance notices: overtime (clocked in without a shift) and punches
// the daily run closed because nobody clocked out. Bell for schedulers; the person whose punch was
// auto-closed also gets an email (category "attendance"). Best-effort, never throws.

const appBaseUrl = () => process.env.APP_BASE_URL ?? 'http://localhost:5173';
const userSelect = { id: true, email: true, firstName: true, locale: true, status: true } as const;

const t = (locale: string | null | undefined, key: string, opts: Record<string, unknown> = {}) =>
  i18n.t(`shifts.clock.${key}`, { lng: resolveEmailLocale(locale), ns: 'emails', ...opts });

const hours = (m: number) => `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;

async function schedulers(tenantId: string, locationId: string) {
  const [byRole, location] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId, status: 'active', roleRef: { OR: [{ isOwner: true }, { modulePermissions: { some: { permission: MANAGE_SHIFTS } } }] } },
      select: userSelect,
    }),
    prisma.location.findUnique({ where: { id: locationId }, select: { managerEmployee: { select: { user: { select: userSelect } } } } }),
  ]);
  const all = [...byRole, ...(location?.managerEmployee?.user?.status === 'active' ? [location.managerEmployee.user] : [])];
  return [...new Map(all.map((u) => [u.id, u])).values()];
}

export async function notifyOvertime(entry: LoadedEntry): Promise<void> {
  try {
    const name = `${entry.employee.firstName} ${entry.employee.lastName}`;
    for (const u of await schedulers(entry.tenantId, entry.locationId)) {
      await createNotification({
        tenantId: entry.tenantId,
        userId: u.id,
        type: 'attendance',
        entityType: 'clockEntry',
        entityId: entry.id,
        message: t(u.locale, 'overtime', { name, location: entry.location.name, hours: hours(workedMinutes(entry)) }),
      });
    }
  } catch (err) {
    console.error('notifyOvertime failed:', err);
  }
}

export async function notifyAutoClosed(entries: LoadedEntry[]): Promise<void> {
  for (const e of entries) {
    try {
      const name = `${e.employee.firstName} ${e.employee.lastName}`;
      const person = await prisma.employee.findUnique({ where: { id: e.employeeId }, select: { user: { select: userSelect } } });
      const recipients = await schedulers(e.tenantId, e.locationId);
      if (person?.user?.status === 'active') recipients.push(person.user);
      for (const u of new Map(recipients.map((x) => [x.id, x])).values()) {
        const own = u.id === person?.user?.id;
        const message = t(u.locale, own ? 'autoClosedOwn' : 'autoClosed', { name, location: e.location.name });
        await createNotification({ tenantId: e.tenantId, userId: u.id, type: 'attendance', entityType: 'clockEntry', entityId: e.id, message });
        if (own) await sendShiftRequestEmail({ to: u.email, locale: u.locale, firstName: u.firstName, message, url: `${appBaseUrl()}/shifts/mine`, category: 'attendance' });
      }
    } catch (err) {
      console.error('notifyAutoClosed failed:', err);
    }
  }
}

// Daily run (phase 2, block B §B.4): to each scheduler, yesterday's absences and late clock-ins at
// the locations they schedule (all of them with manage_shifts), and how many punches wait for a
// review. One bell + one email per person per day; nothing when there's nothing to report.
export async function sendAttendanceSummaries(now: Date = new Date(), only?: string): Promise<number> {
  const locations = await prisma.location.findMany({
    where: { isActive: true, clockMethod: { not: 'off' }, tenant: { status: { notIn: ['suspended', 'cancelled'] }, ...(only ? { id: only } : {}) } },
    select: { id: true, tenantId: true, name: true, timezone: true, tenant: { select: { name: true } }, managerEmployee: { select: { user: { select: userSelect } } } },
  });
  type Line = { location: string; absent: number; late: number };
  const byTenant = new Map<string, { name: string; lines: Map<string, Line>; managers: Map<string, string[]> }>();
  for (const l of locations) {
    const yesterday = addDays(zonedDateString(now, l.timezone), -1);
    const assignments = await prisma.shiftAssignment.findMany({
      where: { status: 'accepted', shift: { locationId: l.id, status: 'published', isOvertime: false, date: new Date(`${yesterday}T00:00:00Z`), endsAt: { lte: now } } },
      select: { id: true, shift: { select: { startsAt: true } } },
    });
    const punches = await prisma.clockEntry.findMany({ where: { shiftAssignmentId: { in: assignments.map((a) => a.id) } }, select: { shiftAssignmentId: true, clockInAt: true } });
    const settings = await prisma.shiftsSettings.findUnique({ where: { tenantId: l.tenantId }, select: { lateToleranceMinutes: true } });
    const tolerance = (settings?.lateToleranceMinutes ?? 5) * 60_000;
    const punched = new Map(punches.map((p) => [p.shiftAssignmentId, p.clockInAt]));
    let absent = 0;
    let late = 0;
    for (const a of assignments) {
      const at = punched.get(a.id);
      if (!at) absent++;
      else if (at.getTime() > a.shift.startsAt.getTime() + tolerance) late++;
    }
    const group = byTenant.get(l.tenantId) ?? { name: l.tenant.name, lines: new Map(), managers: new Map() };
    group.lines.set(l.id, { location: l.name, absent, late });
    const m = l.managerEmployee?.user;
    if (m?.status === 'active') group.managers.set(m.id, [...(group.managers.get(m.id) ?? []), l.id]);
    byTenant.set(l.tenantId, group);
  }

  let sent = 0;
  const since = new Date(now.getTime() - 20 * 3600_000);
  for (const [tenantId, group] of byTenant) {
    const review = await prisma.clockEntry.count({ where: { tenantId, needsReview: true } });
    const all = await schedulersOfTenant(tenantId);
    const recipients = new Map<string, { user: (typeof all)[number]; locationIds: string[] | null }>();
    for (const u of all) recipients.set(u.id, { user: u, locationIds: null });
    for (const [userId, ids] of group.managers) {
      if (recipients.has(userId)) continue;
      const u = await prisma.user.findUnique({ where: { id: userId }, select: userSelect });
      if (u) recipients.set(userId, { user: u, locationIds: ids });
    }
    for (const { user: u, locationIds } of recipients.values()) {
      const lines = [...group.lines.entries()].filter(([id]) => !locationIds || locationIds.includes(id)).map(([, line]) => line);
      const absent = lines.reduce((n, x) => n + x.absent, 0);
      const late = lines.reduce((n, x) => n + x.late, 0);
      if (absent + late + review === 0) continue;
      const already = await prisma.notification.count({ where: { tenantId, userId: u.id, type: 'attendance', entityId: `summary:${tenantId}`, createdAt: { gte: since } } });
      if (already > 0) continue;
      const message = t(u.locale, 'summary', { absent, late, review });
      await createNotification({ tenantId, userId: u.id, type: 'attendance', entityType: 'clockEntry', entityId: `summary:${tenantId}`, message }).catch(() => undefined);
      const detail = lines
        .filter((x) => x.absent + x.late > 0)
        .map((x) => t(u.locale, 'summaryLine', { location: x.location, absent: x.absent, late: x.late }))
        .join(' · ');
      await sendShiftRequestEmail({ to: u.email, locale: u.locale, firstName: u.firstName, message, note: detail || null, url: `${appBaseUrl()}/shifts/today`, category: 'attendance' });
      sent++;
    }
  }
  return sent;
}

async function schedulersOfTenant(tenantId: string) {
  return prisma.user.findMany({
    where: { tenantId, status: 'active', roleRef: { OR: [{ isOwner: true }, { modulePermissions: { some: { permission: MANAGE_SHIFTS } } }] } },
    select: userSelect,
  });
}
