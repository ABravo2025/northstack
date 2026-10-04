import type { LegalPolicyType, PlatformAnnouncementType, Prisma } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import i18n, { resolveEmailLocale } from '../../lib/i18n.js';
import { sendPolicyChangeEmail } from '../../lib/mailer.js';
import { isForAudience } from '../notifications/platformAnnouncementService.js';
import type { Actor, AdminActionResult } from './adminActionService.js';

// Admin Center v2, stage 4 (2026-10-04): the in-app announcements (bell → "What's new") written
// from the Admin: English required, Spanish optional, an audience (plans / countries / specific
// clients, empty = everyone) and an optional future date. A policy change also emails everyone it
// targets, once, at publication — so it can't be scheduled.

const PLAN_KEYS = ['trial', 'starter', 'growth'];
const TYPES: PlatformAnnouncementType[] = ['feature_update', 'policy_change'];
const POLICIES: LegalPolicyType[] = ['terms_of_service', 'privacy_policy', 'refund_policy'];

export interface AnnouncementInput {
  type?: unknown;
  policyType?: unknown;
  title?: unknown;
  summary?: unknown;
  body?: unknown;
  titleEs?: unknown;
  summaryEs?: unknown;
  bodyEs?: unknown;
  targetPlans?: unknown;
  targetCountries?: unknown;
  targetTenantIds?: unknown;
  publishAt?: unknown; // ISO date-time; empty = now
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = (v: unknown, allowed?: string[]) =>
  Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()))).filter((x) => !allowed || allowed.includes(x)) : [];

export function parseAnnouncement(input: AnnouncementInput, now: Date = new Date()):
  | { ok: true; data: Omit<Prisma.PlatformAnnouncementCreateInput, 'createdByUserId'> }
  | { ok: false; error: string } {
  const type = (TYPES.includes(input.type as PlatformAnnouncementType) ? input.type : 'feature_update') as PlatformAnnouncementType;
  const title = str(input.title, 140);
  const summary = str(input.summary, 280);
  const body = str(input.body, 5000);
  if (!title || !summary || !body) return { ok: false, error: 'Completá título, resumen y texto en inglés (son los que ve todo el que no tiene la app en español).' };
  const titleEs = str(input.titleEs, 140) || null;
  const summaryEs = str(input.summaryEs, 280) || null;
  const bodyEs = str(input.bodyEs, 5000) || null;
  if ((summaryEs || bodyEs) && !titleEs) return { ok: false, error: 'Si escribís la versión en español, poné también el título en español.' };
  let policyType: LegalPolicyType | null = null;
  if (type === 'policy_change') {
    if (!POLICIES.includes(input.policyType as LegalPolicyType)) return { ok: false, error: 'Elegí qué política cambió.' };
    policyType = input.policyType as LegalPolicyType;
  }
  let publishedAt = now;
  if (typeof input.publishAt === 'string' && input.publishAt.trim()) {
    const d = new Date(input.publishAt);
    if (Number.isNaN(d.getTime())) return { ok: false, error: 'Fecha de publicación inválida.' };
    if (d > now) {
      if (type === 'policy_change') return { ok: false, error: 'Un cambio de política se publica en el momento (también manda un mail a todos).' };
      publishedAt = d;
    }
  }
  return {
    ok: true,
    data: {
      type,
      policyType,
      title,
      summary,
      body,
      titleEs,
      summaryEs,
      bodyEs,
      targetPlans: list(input.targetPlans, PLAN_KEYS),
      targetCountries: list(input.targetCountries),
      targetTenantIds: list(input.targetTenantIds),
      publishedAt,
    },
  };
}

async function audienceUsers() {
  return prisma.user.findMany({
    where: { status: 'active', tenantId: { not: null }, platformRole: null },
    select: { email: true, firstName: true, locale: true, lastAnnouncementSeenAt: true, tenant: { select: { id: true, plan: true, country: true } } },
  });
}

export async function listAdminAnnouncements(now: Date = new Date()) {
  const [rows, users] = await Promise.all([prisma.platformAnnouncement.findMany({ orderBy: { publishedAt: 'desc' } }), audienceUsers()]);
  const tenantIds = Array.from(new Set(rows.flatMap((r) => r.targetTenantIds)));
  const tenants = tenantIds.length ? await prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }) : [];
  const tenantName = new Map(tenants.map((t) => [t.id, t.name]));
  return rows.map((a) => {
    const reach = users.filter((u) => isForAudience(a, { tenantId: u.tenant?.id ?? null, plan: u.tenant?.plan ?? null, country: u.tenant?.country ?? null }));
    const read = reach.filter((u) => u.lastAnnouncementSeenAt && u.lastAnnouncementSeenAt >= a.publishedAt).length;
    return {
      ...a,
      scheduled: a.publishedAt > now,
      reach: reach.length,
      read,
      targetTenants: a.targetTenantIds.map((id) => ({ id, name: tenantName.get(id) ?? '(cliente borrado)' })),
    };
  });
}

// Countries as clients actually typed them, for the audience picker.
export async function announcementCountries(): Promise<string[]> {
  const rows = await prisma.tenant.groupBy({ by: ['country'], where: { country: { not: null } } });
  return rows.map((r) => r.country!).filter((c) => c.trim()).sort((a, b) => a.localeCompare(b));
}

async function audit(actor: Actor, action: string, reason: string, details: Prisma.InputJsonValue) {
  await prisma.platformAuditEntry.create({ data: { actorUserId: actor.id, tenantId: null, action, reason, details } });
}

export async function createAdminAnnouncement(input: AnnouncementInput, actor: Actor): Promise<AdminActionResult> {
  const parsed = parseAnnouncement(input);
  if (!parsed.ok) return { success: false, error: parsed.error };
  const a = await prisma.platformAnnouncement.create({ data: { ...parsed.data, createdByUserId: actor.id } });
  let emailed = 0;
  if (a.type === 'policy_change') {
    const users = (await audienceUsers()).filter((u) => isForAudience(a, { tenantId: u.tenant?.id ?? null, plan: u.tenant?.plan ?? null, country: u.tenant?.country ?? null }));
    const appUrl = `${process.env.APP_BASE_URL ?? 'http://localhost:5173'}/help`;
    for (const u of users) {
      const lng = resolveEmailLocale(u.locale);
      const es = lng.startsWith('es') && a.titleEs;
      await sendPolicyChangeEmail({
        to: u.email,
        firstName: u.firstName,
        policyTitle: i18n.t(a.policyType ? `policyChange.policyTitles.${a.policyType}` : 'policyChange.policyTitles.default', { lng, ns: 'emails' }),
        summary: es ? a.summaryEs || a.summary : a.summary,
        appUrl,
        locale: u.locale,
      });
      emailed++;
    }
  }
  await audit(actor, 'announcement_create', a.title, { id: a.id, type: a.type, publishedAt: a.publishedAt.toISOString(), emailed });
  return { success: true, message: a.publishedAt > new Date() ? `Programado para el ${a.publishedAt.toLocaleString('es-AR')}.` : emailed ? `Publicado y enviado por mail a ${emailed} personas.` : 'Publicado.' };
}

export async function updateAdminAnnouncement(id: string, input: AnnouncementInput, actor: Actor): Promise<AdminActionResult> {
  const existing = await prisma.platformAnnouncement.findUnique({ where: { id } });
  if (!existing) return { success: false, error: 'Ese anuncio no existe.' };
  // Editing never re-sends a policy-change email; keep its original type and date when already out.
  const alreadyOut = existing.publishedAt <= new Date();
  const parsed = parseAnnouncement({ ...input, type: existing.type, policyType: existing.policyType ?? input.policyType, publishAt: alreadyOut ? '' : input.publishAt });
  if (!parsed.ok) return { success: false, error: parsed.error };
  const { publishedAt, type: _t, ...rest } = parsed.data;
  await prisma.platformAnnouncement.update({ where: { id }, data: { ...rest, ...(alreadyOut ? {} : { publishedAt }) } });
  await audit(actor, 'announcement_update', existing.title, { id });
  return { success: true, message: 'Anuncio actualizado.' };
}

export async function deleteAdminAnnouncement(id: string, actor: Actor): Promise<AdminActionResult> {
  const existing = await prisma.platformAnnouncement.findUnique({ where: { id } });
  if (!existing) return { success: false, error: 'Ese anuncio no existe.' };
  await prisma.platformAnnouncement.delete({ where: { id } });
  await audit(actor, 'announcement_delete', existing.title, { id, title: existing.title });
  return { success: true, message: 'Anuncio borrado.' };
}
