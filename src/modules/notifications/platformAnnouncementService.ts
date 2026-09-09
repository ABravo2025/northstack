import prisma from '../../lib/prisma.js';
import { bestEffort } from '../../lib/bestEffort.js';
import { sendPolicyChangeEmail } from '../../lib/mailer.js';
import type { LegalPolicyType, PlatformAnnouncement, PlatformAnnouncementType } from '@prisma/client';

const POLICY_TITLES: Record<LegalPolicyType, string> = {
  terms_of_service: 'Terms of Service',
  privacy_policy: 'Privacy Policy',
  refund_policy: 'Refund Policy',
};

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
      select: { email: true, firstName: true },
    });
    const appUrl = `${process.env.APP_BASE_URL ?? 'http://localhost:5173'}/help`;
    const policyTitle = input.policyType ? POLICY_TITLES[input.policyType] : 'our policies';
    for (const user of users) {
      await bestEffort(
        sendPolicyChangeEmail({ to: user.email, firstName: user.firstName, policyTitle, summary: input.summary, appUrl }),
        `Failed to send policy-change email to ${user.email}`,
      );
    }
  }

  return announcement;
}

export interface AnnouncementWithReadState extends PlatformAnnouncement {
  isUnread: boolean;
}

// Newest first — same idiom as the bell dropdown for personal notifications.
export async function listAnnouncementsForUser(userId: string): Promise<AnnouncementWithReadState[]> {
  const [user, announcements] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { lastAnnouncementSeenAt: true } }),
    prisma.platformAnnouncement.findMany({ orderBy: { publishedAt: 'desc' } }),
  ]);
  const lastSeen = user?.lastAnnouncementSeenAt ?? null;
  return announcements.map((a) => ({ ...a, isUnread: !lastSeen || a.publishedAt > lastSeen }));
}

export async function countUnreadAnnouncements(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { lastAnnouncementSeenAt: true } });
  if (!user?.lastAnnouncementSeenAt) {
    return prisma.platformAnnouncement.count();
  }
  return prisma.platformAnnouncement.count({ where: { publishedAt: { gt: user.lastAnnouncementSeenAt } } });
}

// Bumps the cursor to now — same "opening the list clears the badge" behavior the old
// frontend-only changelog dot had via localStorage, just server-side so it also drives the
// bell's unread count. Not per-announcement: opening an older entry doesn't advance past a
// newer, still-unseen one, since there's only one cursor per user (see schema.prisma).
export async function markAnnouncementsSeen(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { lastAnnouncementSeenAt: new Date() } });
}
