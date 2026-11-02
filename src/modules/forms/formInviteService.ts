import type { Form } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { hashInviteToken, isFormsEncryptionConfigured, newInviteToken } from '../../lib/formsEncryption.js';
import { sendFormInviteEmail } from '../../lib/mailer.js';
import { isFormsAllowed } from '../tenant/planLimits.js';
import { PERSONAL_ACTIONS, type FormAction } from './formDefinitions.js';
import { FormError } from './formService.js';
import { submitResponse } from './formResponseService.js';

// Formularios y encuestas → personal links (spec-clientes-gastos-formularios.md, B4). Clients and
// employees get a link of their own by email, so Northstack knows who answers without asking.
// At most one invite per person and form every 60 days; a link lasts 30 days and answers once.

export const RESEND_GAP_DAYS = 60;
const LINK_DAYS = 30;
const DAY = 86_400_000;

export type RecipientType = 'contact' | 'employee';

// Who a personal form or survey is for, by module.
export function recipientTypeFor(form: Pick<Form, 'module'>): RecipientType | null {
  if (form.module === 'employees') return 'employee';
  if (form.module === 'clients' || form.module === 'leads') return 'contact';
  return null;
}

export function isPersonalForm(form: Pick<Form, 'kind' | 'action'>): boolean {
  return form.kind === 'survey' || PERSONAL_ACTIONS.includes(form.action as FormAction);
}

function appUrl() {
  return process.env.APP_BASE_URL ?? 'http://localhost:5173';
}

async function sendableForm(tenantId: string, formId: string) {
  const form = await prisma.form.findFirst({ where: { id: formId, tenantId } });
  if (!form) throw new FormError('Form not found', 404);
  if (form.fields === null || !isPersonalForm(form)) throw new FormError('This form is answered from its public link', 400, 'not_personal');
  if (form.status !== 'published') throw new FormError('Publish it before sending it', 400, 'not_published');
  const type = recipientTypeFor(form);
  if (!type) throw new FormError('This form has no recipients', 400, 'not_personal');
  return { form, type };
}

async function recipientsById(tenantId: string, type: RecipientType, ids: string[]) {
  if (type === 'contact') {
    const rows = await prisma.contact.findMany({ where: { tenantId, id: { in: ids }, isActive: true }, select: { id: true, firstName: true, lastName: true, email: true } });
    return rows.map((r) => ({ id: r.id, firstName: r.firstName, name: `${r.firstName} ${r.lastName}`.trim(), email: r.email }));
  }
  const rows = await prisma.employee.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, firstName: true, lastName: true, email: true } });
  return rows.map((r) => ({ id: r.id, firstName: r.firstName, name: `${r.firstName} ${r.lastName}`.trim(), email: r.email }));
}

async function recentlyInvited(formId: string, recipientIds: string[], now: Date) {
  const rows = await prisma.formInvite.findMany({
    where: { formId, recipientId: { in: recipientIds }, sentAt: { gte: new Date(now.getTime() - RESEND_GAP_DAYS * DAY) } },
    select: { recipientId: true },
  });
  return new Set(rows.map((r) => r.recipientId));
}

// Sends the form to each recipient, skipping who already got it in the last 60 days.
export async function sendInvites(
  tenantId: string,
  formId: string,
  input: { recipientIds: string[]; trigger?: string; createdById?: string | null },
  now = new Date(),
) {
  const { form, type } = await sendableForm(tenantId, formId);
  const ids = [...new Set(input.recipientIds)].slice(0, 500);
  const [recipients, recent, tenant] = await Promise.all([
    recipientsById(tenantId, type, ids),
    recentlyInvited(form.id, ids, now),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, country: true } }),
  ]);
  const users = await prisma.user.findMany({ where: { tenantId, email: { in: recipients.map((r) => r.email) } }, select: { email: true, locale: true } });
  const localeOf = new Map(users.map((u) => [u.email.toLowerCase(), u.locale]));
  const fallbackLocale = tenant?.country && tenant.country !== 'US' ? 'es' : 'en';
  const survey = (form.surveySettings ?? {}) as { anonymous?: boolean };

  const skipped: { id: string; reason: 'recent' | 'not_found' }[] = ids.filter((id) => !recipients.some((r) => r.id === id)).map((id) => ({ id, reason: 'not_found' as const }));
  let sent = 0;
  for (const r of recipients) {
    if (recent.has(r.id)) {
      skipped.push({ id: r.id, reason: 'recent' });
      continue;
    }
    const { token, tokenHash } = newInviteToken();
    const expiresAt = new Date(now.getTime() + LINK_DAYS * DAY);
    await prisma.formInvite.create({
      data: {
        tenantId,
        formId: form.id,
        tokenHash,
        recipientType: type,
        recipientId: r.id,
        trigger: input.trigger ?? 'manual',
        sentAt: now,
        expiresAt,
        createdById: input.createdById ?? null,
      },
    });
    await sendFormInviteEmail({
      to: r.email,
      firstName: r.firstName,
      tenantName: tenant?.name ?? '',
      formName: form.name,
      isSurvey: form.kind === 'survey',
      anonymous: form.kind === 'survey' && survey.anonymous === true,
      url: `${appUrl()}/f/p/${token}`,
      expiresAt,
      locale: localeOf.get(r.email.toLowerCase()) ?? fallbackLocale,
    });
    sent++;
  }
  return { sent, skipped };
}

// The editor's recipient picker: who can receive this form, and when each last got it.
export async function listCandidates(tenantId: string, formId: string, q?: string) {
  const { form, type } = await sendableForm(tenantId, formId);
  const search = q?.trim();
  const rows =
    type === 'contact'
      ? await prisma.contact.findMany({
          where: {
            tenantId,
            isActive: true,
            ...(search ? { OR: [{ firstName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] } : {}),
          },
          select: { id: true, firstName: true, lastName: true, email: true, company: { select: { name: true } } },
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
          take: 100,
        })
      : await prisma.employee.findMany({
          where: {
            tenantId,
            OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
            ...(search ? { AND: [{ OR: [{ firstName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] }] } : {}),
          },
          select: { id: true, firstName: true, lastName: true, email: true, departmentDefn: { select: { name: true } } },
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
          take: 100,
        });
  const last = await prisma.formInvite.groupBy({
    by: ['recipientId'],
    where: { formId: form.id, recipientId: { in: rows.map((r) => r.id) } },
    _max: { sentAt: true },
  });
  const lastSent = new Map(last.map((l) => [l.recipientId, l._max.sentAt]));
  const cutoff = Date.now() - RESEND_GAP_DAYS * DAY;
  return {
    recipientType: type,
    candidates: rows.map((r) => {
      const sentAt = lastSent.get(r.id) ?? null;
      const detail = 'company' in r ? (r.company?.name ?? null) : 'departmentDefn' in r ? (r.departmentDefn?.name ?? null) : null;
      return {
        id: r.id,
        name: `${r.firstName} ${r.lastName}`.trim(),
        email: r.email,
        detail,
        lastSentAt: sentAt,
        canSend: !sentAt || sentAt.getTime() < cutoff,
      };
    }),
  };
}

export async function listInvites(tenantId: string, formId: string) {
  const form = await prisma.form.findFirst({ where: { id: formId, tenantId }, select: { id: true, module: true, kind: true, surveySettings: true } });
  if (!form) throw new FormError('Form not found', 404);
  const invites = await prisma.formInvite.findMany({ where: { tenantId, formId }, orderBy: { sentAt: 'desc' }, take: 300 });
  const type = recipientTypeFor(form);
  const names = new Map(
    (await recipientsById(tenantId, type ?? 'contact', [...new Set(invites.map((i) => i.recipientId))])).map((r) => [r.id, r.name]),
  );
  const now = Date.now();
  return {
    total: invites.length,
    responded: invites.filter((i) => i.respondedAt).length,
    invites: invites.map((i) => ({
      id: i.id,
      recipientName: names.get(i.recipientId) ?? '—',
      trigger: i.trigger,
      sentAt: i.sentAt,
      // Anonymous surveys never say who answered, not even here.
      status: i.respondedAt ? ((form.surveySettings as { anonymous?: boolean } | null)?.anonymous && form.kind === 'survey' ? 'closed' : 'responded') : i.expiresAt.getTime() < now ? 'expired' : 'pending',
    })),
  };
}

// --- The personal page --------------------------------------------------------------------------

export async function findInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{30,100}$/.test(token) || !isFormsEncryptionConfigured()) return null;
  const invite = await prisma.formInvite.findUnique({ where: { tokenHash: hashInviteToken(token) }, include: { form: true, tenant: true } });
  if (!invite || invite.form.fields === null || invite.form.status !== 'published' || !isFormsAllowed(invite.tenant)) return null;
  const state: 'open' | 'answered' | 'expired' = invite.respondedAt ? 'answered' : invite.expiresAt.getTime() < Date.now() ? 'expired' : 'open';
  const [recipient] = await recipientsById(invite.tenantId, invite.recipientType as RecipientType, [invite.recipientId]);
  return { invite, form: invite.form, tenant: invite.tenant, state, firstName: recipient?.firstName ?? null };
}

export async function submitInvite(token: string, answers: Record<string, unknown>) {
  const found = await findInvite(token);
  if (!found) throw new FormError('Link not found', 404, 'not_found');
  if (found.state === 'answered') throw new FormError('This link was already answered', 409, 'already_answered');
  if (found.state === 'expired') throw new FormError('This link expired', 410, 'expired');
  // Claim the invite first, so two tabs submitting at once can't both answer it.
  const claimed = await prisma.formInvite.updateMany({ where: { id: found.invite.id, respondedAt: null }, data: { respondedAt: new Date() } });
  if (claimed.count === 0) throw new FormError('This link was already answered', 409, 'already_answered');
  try {
    const result = await submitResponse(found.form, answers, {
      source: 'personal_link',
      respondent: { type: found.invite.recipientType as RecipientType, id: found.invite.recipientId },
    });
    await prisma.formInvite.update({ where: { id: found.invite.id }, data: { responseId: result.responseId } });
    return { form: found.form, result };
  } catch (error) {
    await prisma.formInvite.update({ where: { id: found.invite.id }, data: { respondedAt: null } });
    throw error;
  }
}

// --- Automatic surveys (daily job) ---------------------------------------------------------------

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const startOf = (iso: string) => new Date(`${iso}T00:00:00Z`);

// Runs every published survey that has an automatic trigger. Each trigger looks at a window that
// ends today, and the 60-day rule makes a second run the same day send nothing new. "When a ticket
// is closed" arrives with customer tickets (C7).
export async function runSurveyTriggers(today = dateOnly(new Date())) {
  if (!isFormsEncryptionConfigured()) return { forms: 0, sent: 0, skipped: true };
  const surveys = await prisma.form.findMany({
    where: { kind: 'survey', status: 'published' },
    include: { tenant: true },
  });
  const todayStart = startOf(today);
  const yesterday = new Date(todayStart.getTime() - DAY);
  let sent = 0;
  let forms = 0;
  for (const form of surveys) {
    const trigger = (form.surveySettings as { trigger?: string } | null)?.trigger ?? 'manual';
    if (trigger === 'manual' || form.fields === null || !isFormsAllowed(form.tenant)) continue;
    let ids: string[] = [];
    const tenantId = form.tenantId;
    if (trigger === 'every_90_days') {
      // The main contact of each client company.
      ids = (await prisma.contact.findMany({ where: { tenantId, isActive: true, isPrimary: true, companyId: { not: null } }, select: { id: true } })).map((c) => c.id);
    } else if (trigger === 'quarterly') {
      if (['01-01', '04-01', '07-01', '10-01'].includes(today.slice(5))) {
        ids = (await prisma.employee.findMany({ where: { tenantId, OR: [{ endDate: null }, { endDate: { gte: todayStart } }] }, select: { id: true } })).map((e) => e.id);
      }
    } else if (trigger === '30_days_after_hire') {
      const day = new Date(todayStart.getTime() - 30 * DAY);
      ids = (await prisma.employee.findMany({ where: { tenantId, startDate: { gte: day, lt: new Date(day.getTime() + DAY) } }, select: { id: true } })).map((e) => e.id);
    } else if (trigger === 'offboarding') {
      ids = (
        await prisma.employeeTermination.findMany({
          where: { tenantId, cancelledAt: null, terminationDate: { gte: yesterday, lt: new Date(todayStart.getTime() + DAY) } },
          select: { employeeId: true },
        })
      ).map((t) => t.employeeId);
    } else if (trigger === 'onboarding_done') {
      // Clientes C3: the onboarding project of a handed-off deal was completed in the last day.
      const done = await prisma.project.findMany({
        where: { tenantId, status: 'completed', updatedAt: { gte: yesterday } },
        select: { id: true },
      });
      if (done.length) {
        const deals = await prisma.opportunity.findMany({
          where: { tenantId, handoffProjectId: { in: done.map((p) => p.id) } },
          select: { contactLinks: { select: { contactId: true } } },
        });
        ids = deals.flatMap((d) => d.contactLinks.map((c) => c.contactId));
      }
    } else if (trigger === 'opportunity_lost') {
      const lost = await prisma.opportunityStageHistory.findMany({
        where: { tenantId, enteredAt: { gte: yesterday }, stage: { outcome: 'lost' } },
        select: { opportunity: { select: { contactLinks: { select: { contactId: true } } } } },
      });
      ids = lost.flatMap((l) => l.opportunity.contactLinks.map((c) => c.contactId));
    }
    if (!ids.length) continue;
    forms++;
    const result = await sendInvites(tenantId, form.id, { recipientIds: ids, trigger }, new Date());
    sent += result.sent;
  }
  return { forms, sent };
}
