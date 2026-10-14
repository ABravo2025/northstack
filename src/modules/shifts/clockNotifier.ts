import prisma from '../../lib/prisma.js';
import i18n, { resolveEmailLocale } from '../../lib/i18n.js';
import { sendShiftRequestEmail } from '../../lib/mailer.js';
import { MANAGE_SHIFTS } from '../auth/roleService.js';
import { createNotification } from '../notifications/notificationService.js';
import { workedMinutes, type LoadedEntry } from './clockService.js';

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
