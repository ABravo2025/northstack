import type { NotificationType } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import i18n, { resolveEmailLocale } from '../../lib/i18n.js';
import { sendShiftRequestEmail } from '../../lib/mailer.js';
import { MANAGE_SHIFTS } from '../auth/roleService.js';
import { createNotification } from '../notifications/notificationService.js';
import { formatShiftWhen } from './shiftNotifier.js';
import type { LoadedRequest, RequestOutcome } from './shiftRequestService.js';

// Shifts phase 2, block A — who hears about a claim, hand-over or swap, in their own language:
// the colleague asked to swap, the managers when it needs approval, and the people involved when it
// is done, declined or expired. Bell + email (category "shiftSwaps"). Best-effort, never throws.

const appBaseUrl = () => process.env.APP_BASE_URL ?? 'http://localhost:5173';
const userSelect = { id: true, email: true, firstName: true, locale: true, status: true } as const;
type Recipient = { id: string; email: string; firstName: string; locale: string | null; status: string };

const t = (locale: string | null | undefined, key: string, opts: Record<string, unknown> = {}) =>
  i18n.t(`shifts.request.${key}`, { lng: resolveEmailLocale(locale), ns: 'emails', ...opts });

const name = (e: { firstName: string; lastName: string } | null) => (e ? `${e.firstName} ${e.lastName}` : '');

async function userOf(employeeId: string | null): Promise<Recipient | null> {
  if (!employeeId) return null;
  const e = await prisma.employee.findUnique({ where: { id: employeeId }, select: { user: { select: userSelect } } });
  return e?.user && e.user.status === 'active' ? e.user : null;
}

// Owner, roles with manage_shifts, and the location's manager — never the people in the request.
async function managers(r: LoadedRequest): Promise<Recipient[]> {
  const location = await prisma.location.findUnique({ where: { id: r.shift.location.id }, select: { managerEmployee: { select: { user: { select: userSelect } } } } });
  const byRole = await prisma.user.findMany({
    where: { tenantId: r.tenantId, status: 'active', roleRef: { OR: [{ isOwner: true }, { modulePermissions: { some: { permission: MANAGE_SHIFTS } } }] } },
    select: userSelect,
  });
  const all = [...byRole, ...(location?.managerEmployee?.user?.status === 'active' ? [location.managerEmployee.user] : [])];
  const skip = new Set([r.requestedBy.userId, r.targetEmployee?.userId].filter(Boolean));
  return [...new Map(all.filter((u) => !skip.has(u.id)).map((u) => [u.id, u])).values()];
}

async function tell(r: LoadedRequest, to: Recipient[], type: NotificationType, key: string, url: string) {
  for (const u of to) {
    const vars = {
      name: name(r.requestedBy),
      other: name(r.targetEmployee),
      when: formatShiftWhen(r.shift, u.locale),
      otherWhen: r.targetShift ? formatShiftWhen(r.targetShift, u.locale) : '',
      location: r.shift.location.name,
    };
    const message = t(u.locale, key, vars);
    await createNotification({ tenantId: r.tenantId, userId: u.id, type, entityType: 'shiftRequest', entityId: r.id, message }).catch((err) =>
      console.error('Failed to create shift request notification:', err),
    );
    await sendShiftRequestEmail({ to: u.email, locale: u.locale, firstName: u.firstName, message, note: r.decisionNote ?? r.reason, url });
  }
}

const mineUrl = () => `${appBaseUrl()}/shifts/mine`;
const requestsUrl = () => `${appBaseUrl()}/shifts/requests`;

export async function notifyRequest(outcome: RequestOutcome): Promise<void> {
  try {
    const r = outcome.request;
    const requester = await userOf(r.requestedByEmployeeId);
    const target = await userOf(r.targetEmployeeId);
    if (outcome.notice === 'peer' && target) {
      await tell(r, [target], 'shift_request', 'swapAsk', mineUrl());
    } else if (outcome.notice === 'manager') {
      const key = r.type === 'claim' ? 'managerClaim' : r.type === 'give' ? 'managerCover' : 'managerSwap';
      await tell(r, await managers(r), 'shift_request', key, requestsUrl());
    } else if (outcome.notice === 'done') {
      const key = r.type === 'claim' ? 'doneClaim' : r.type === 'give' ? 'doneGive' : 'doneSwap';
      await tell(r, [requester, target].filter((u): u is Recipient => !!u), 'shift_request_decided', key, mineUrl());
    } else if (outcome.notice === 'declined' && outcome.declined) {
      // The colleague said no, the manager said no, or the manager turned down who offered to
      // cover a hand-over (that one goes back to the board).
      const to: Recipient[] = [];
      for (const id of outcome.declined.employeeIds) {
        const u = await userOf(id);
        if (u) to.push(u);
      }
      await tell(r, to, 'shift_request_decided', outcome.declined.key, mineUrl());
    }
  } catch (err) {
    console.error('notifyRequest failed:', err);
  }
}

export async function notifyExpired(requests: LoadedRequest[]): Promise<void> {
  for (const r of requests) {
    try {
      const to = [await userOf(r.requestedByEmployeeId), await userOf(r.targetEmployeeId)].filter((u): u is Recipient => !!u);
      await tell(r, to, 'shift_request_decided', 'expired', mineUrl());
    } catch (err) {
      console.error('notifyExpired failed:', err);
    }
  }
}
