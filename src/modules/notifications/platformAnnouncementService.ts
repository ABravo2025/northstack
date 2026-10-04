import prisma from '../../lib/prisma.js';
import { sendPolicyChangeEmail } from '../../lib/mailer.js';
import i18n, { resolveEmailLocale } from '../../lib/i18n.js';
import type { LegalPolicyType, PlatformAnnouncement, PlatformAnnouncementType } from '@prisma/client';

// Resolved per-recipient (not once for the whole batch) since each active user can have a
// different locale — docs/general/spec-i18n.md Unidad 9.
function policyTitleFor(policyType: LegalPolicyType | undefined, locale: string | null): string {
  const lng = resolveEmailLocale(locale);
  const key = policyType ? `policyChange.policyTitles.${policyType}` : 'policyChange.policyTitles.default';
  return i18n.t(key, { lng, ns: 'emails' });
}

export interface CreateAnnouncementInput {
  type: PlatformAnnouncementType;
  title: string;
  summary: string;
  body: string;
  policyType?: LegalPolicyType;
}

// No create endpoint exposed via the API — published only via scripts/publish-announcement.ts,
// same "system-generated, never a user-facing form" reasoning as Notification's createNotification.
export async function createAnnouncement(input: CreateAnnouncementInput): Promise<PlatformAnnouncement> {
  const announcement = await prisma.platformAnnouncement.create({
    data: {
      type: input.type,
      title: input.title,
      summary: input.summary,
      body: input.body,
      policyType: input.policyType,
    },
  });

  if (input.type === 'policy_change') {
    const users = await prisma.user.findMany({
      where: { status: 'active', tenantId: { not: null } },
      select: { email: true, firstName: true, locale: true },
    });
    const appUrl = `${process.env.APP_BASE_URL ?? 'http://localhost:5173'}/help`;
    // sendPolicyChangeEmail already swallows its own errors (see mailer.ts).
    for (const user of users) {
      await sendPolicyChangeEmail({
        to: user.email,
        firstName: user.firstName,
        policyTitle: policyTitleFor(input.policyType, user.locale),
        summary: input.summary,
        appUrl,
        locale: user.locale,
      });
    }
  }

  return announcement;
}

export interface AnnouncementWithReadState extends PlatformAnnouncement {
  isUnread: boolean;
}

// Admin Center v2, stage 4 (2026-10-04): who an announcement is for. An empty list means "everyone"
// for that dimension; all non-empty dimensions must match. Plan "trial" = no plan chosen yet.
export interface AnnouncementAudience {
  tenantId: string | null;
  plan: string | null;
  country: string | null;
}

export function isForAudience(
  a: Pick<PlatformAnnouncement, 'targetPlans' | 'targetCountries' | 'targetTenantIds'>,
  who: AnnouncementAudience,
): boolean {
  if (a.targetTenantIds.length && (!who.tenantId || !a.targetTenantIds.includes(who.tenantId))) return false;
  if (a.targetPlans.length && !a.targetPlans.includes(who.plan ?? 'trial')) return false;
  if (a.targetCountries.length) {
    const c = (who.country ?? '').trim().toLowerCase();
    if (!c || !a.targetCountries.some((t) => t.trim().toLowerCase() === c)) return false;
  }
  return true;
}

// The user's language version when there is one (Spanish fields are optional).
export function localizeAnnouncement<T extends PlatformAnnouncement>(a: T, locale: string | null | undefined): T {
  if (!locale?.toLowerCase().startsWith('es') || !a.titleEs) return a;
  return { ...a, title: a.titleEs, summary: a.summaryEs || a.summary, body: a.bodyEs || a.body };
}

async function visibleAnnouncements(userId: string, now: Date = new Date()) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastAnnouncementSeenAt: true, locale: true, tenant: { select: { id: true, plan: true, country: true } } },
  });
  const all = await prisma.platformAnnouncement.findMany({ where: { publishedAt: { lte: now } }, orderBy: { publishedAt: 'desc' } });
  const who: AnnouncementAudience = { tenantId: user?.tenant?.id ?? null, plan: user?.tenant?.plan ?? null, country: user?.tenant?.country ?? null };
  return { user, announcements: all.filter((a) => isForAudience(a, who)) };
}

// Newest first — same idiom as the bell dropdown for personal notifications. Scheduled ones
// (publishedAt in the future) and ones aimed at other clients are left out.
export async function listAnnouncementsForUser(userId: string): Promise<AnnouncementWithReadState[]> {
  const { user, announcements } = await visibleAnnouncements(userId);
  const lastSeen = user?.lastAnnouncementSeenAt ?? null;
  return announcements.map((a) => ({ ...localizeAnnouncement(a, user?.locale), isUnread: !lastSeen || a.publishedAt > lastSeen }));
}

export async function countUnreadAnnouncements(userId: string): Promise<number> {
  const { user, announcements } = await visibleAnnouncements(userId);
  const lastSeen = user?.lastAnnouncementSeenAt ?? null;
  return announcements.filter((a) => !lastSeen || a.publishedAt > lastSeen).length;
}

// Bumps the cursor to now — same "opening the list clears the badge" behavior the old
// frontend-only changelog dot had via localStorage, just server-side so it also drives the
// bell's unread count. Not per-announcement: opening an older entry doesn't advance past a
// newer, still-unseen one, since there's only one cursor per user (see schema.prisma).
export async function markAnnouncementsSeen(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { lastAnnouncementSeenAt: new Date() } });
}
