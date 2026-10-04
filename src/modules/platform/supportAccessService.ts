import { createHash, randomBytes } from 'node:crypto';
import prisma from '../../lib/prisma.js';
import { sendSupportAccessRequestEmail } from '../../lib/mailer.js';
import type { Actor, AdminActionResult } from './adminActionService.js';

// Admin Center v2, stage 5 (2026-10-04): "Entrar como soporte" — never without the customer's
// consent (Alejandro, 2026-10-03). Staff asks one specific user of the client; that user accepts
// or rejects in the app; the access window starts at acceptance and the user can end it any time.
// Staff then opens a support session through a one-time code (60 s), never a token in a URL.

const MINUTE = 60 * 1000;
export const REQUEST_TTL_MS = 24 * 60 * MINUTE;
export const ALLOWED_DURATIONS = [30, 120, 1440];
const ENTRY_CODE_TTL_MS = 60 * 1000;
const SESSION_TOKEN_BYTES = 32;

const hash = (v: string) => createHash('sha256').update(v).digest('hex');

async function audit(actor: Actor, tenantId: string, action: string, reason: string, details: Record<string, unknown>) {
  await prisma.platformAuditEntry.create({ data: { actorUserId: actor.id, tenantId, action, reason, details: details as object } });
}

// Lazily moves a request to its time-based state (pending past 24 h → expired, approved past its
// window → ended) so every reader sees the truth without a cron.
export function effectiveStatus(r: { status: string; requestExpiresAt: Date; accessEndsAt: Date | null }, now: Date = new Date()): string {
  if (r.status === 'pending' && r.requestExpiresAt <= now) return 'expired';
  if (r.status === 'approved' && r.accessEndsAt && r.accessEndsAt <= now) return 'ended';
  return r.status;
}

// ------------------------------------------------------------------------------- staff side

export async function requestSupportAccess(
  tenantId: string,
  input: { targetUserId?: unknown; mode?: unknown; durationMinutes?: unknown },
  actor: Actor,
  reason: string,
  appUrl: string = process.env.APP_BASE_URL ?? 'https://app.joinnorthstack.com',
): Promise<AdminActionResult> {
  const mode = input.mode === 'edit' ? 'edit' : 'read_only';
  const duration = Number(input.durationMinutes);
  if (!ALLOWED_DURATIONS.includes(duration)) return { success: false, error: 'Elegí 30 minutos, 2 horas o 24 horas.' };
  if (typeof input.targetUserId !== 'string') return { success: false, error: 'Elegí a quién del cliente le pedís permiso.' };
  const target = await prisma.user.findFirst({
    where: { id: input.targetUserId, tenantId, status: 'active' },
    select: { id: true, email: true, firstName: true, locale: true, tenant: { select: { name: true } } },
  });
  if (!target) return { success: false, error: 'Esa persona no es un usuario activo de este cliente.' };

  const now = new Date();
  const open = await prisma.supportAccessRequest.findMany({ where: { tenantId, status: { in: ['pending', 'approved'] } } });
  if (open.some((r) => ['pending', 'approved'].includes(effectiveStatus(r, now)))) {
    return { success: false, error: 'Ya hay un pedido pendiente o un acceso activo para este cliente.' };
  }

  const request = await prisma.supportAccessRequest.create({
    data: { tenantId, requestedById: actor.id, targetUserId: target.id, reason, mode, durationMinutes: duration, status: 'pending', requestExpiresAt: new Date(now.getTime() + REQUEST_TTL_MS) },
  });
  const staff = await prisma.user.findUnique({ where: { id: actor.id }, select: { firstName: true, lastName: true } });
  await sendSupportAccessRequestEmail({
    to: target.email,
    firstName: target.firstName,
    staffName: staff ? `${staff.firstName} ${staff.lastName}`.trim() : 'Northstack',
    tenantName: target.tenant?.name ?? '',
    reason,
    readOnly: mode === 'read_only',
    durationMinutes: duration,
    appUrl,
    locale: target.locale,
  });
  await audit(actor, tenantId, 'support_request', reason, { requestId: request.id, targetUserId: target.id, email: target.email, mode, durationMinutes: duration });
  return { success: true, message: `Pedido enviado a ${target.email}. Te avisa el Admin cuando lo acepte.` };
}

export async function listSupportRequests(tenantId: string, now: Date = new Date()) {
  const rows = await prisma.supportAccessRequest.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { targetUser: { select: { firstName: true, lastName: true, email: true } }, requestedBy: { select: { firstName: true, lastName: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    status: effectiveStatus(r, now),
    mode: r.mode,
    durationMinutes: r.durationMinutes,
    reason: r.reason,
    createdAt: r.createdAt,
    requestExpiresAt: r.requestExpiresAt,
    decidedAt: r.decidedAt,
    accessEndsAt: r.accessEndsAt,
    endedAt: r.endedAt,
    endedBy: r.endedBy,
    target: { name: `${r.targetUser.firstName} ${r.targetUser.lastName}`.trim(), email: r.targetUser.email },
    requestedBy: `${r.requestedBy.firstName} ${r.requestedBy.lastName}`.trim(),
  }));
}

// Issues a one-time code (valid 60 s) that the customer app exchanges for the support session.
export async function issueSupportEntryCode(tenantId: string, requestId: string, actor: Actor): Promise<{ success: true; code: string } | { success: false; error: string }> {
  const r = await prisma.supportAccessRequest.findFirst({ where: { id: requestId, tenantId } });
  if (!r) return { success: false, error: 'Ese pedido no existe.' };
  if (effectiveStatus(r) !== 'approved') return { success: false, error: 'El acceso no está activo (no lo aceptaron todavía, venció o lo terminaron).' };
  if (r.requestedById !== actor.id) return { success: false, error: 'Solo puede entrar quien pidió el acceso.' };
  const code = randomBytes(24).toString('base64url');
  await prisma.supportAccessRequest.update({ where: { id: r.id }, data: { entryCodeHash: hash(code), entryCodeExpires: new Date(Date.now() + ENTRY_CODE_TTL_MS) } });
  await audit(actor, tenantId, 'support_enter', r.reason, { requestId: r.id, mode: r.mode });
  return { success: true, code };
}

export async function endSupportAccessByStaff(tenantId: string, requestId: string, actor: Actor): Promise<AdminActionResult> {
  const r = await prisma.supportAccessRequest.findFirst({ where: { id: requestId, tenantId } });
  if (!r) return { success: false, error: 'Ese pedido no existe.' };
  const status = effectiveStatus(r);
  if (status !== 'pending' && status !== 'approved') return { success: false, error: 'Ya no está activo.' };
  await closeRequest(r.id, status === 'pending' ? 'expired' : 'ended', 'staff');
  await audit(actor, tenantId, 'support_end', r.reason, { requestId: r.id, was: status });
  return { success: true, message: status === 'pending' ? 'Pedido cancelado.' : 'Acceso terminado.' };
}

async function closeRequest(id: string, status: 'ended' | 'expired' | 'rejected', by: 'customer' | 'staff') {
  await prisma.$transaction([
    prisma.supportAccessRequest.update({ where: { id }, data: { status, endedAt: new Date(), endedBy: by, entryCodeHash: null, entryCodeExpires: null } }),
    prisma.session.deleteMany({ where: { supportAccessRequestId: id } }),
  ]);
}

// ---------------------------------------------------------------------------- customer side

export async function pendingForUser(userId: string, now: Date = new Date()) {
  const rows = await prisma.supportAccessRequest.findMany({
    where: { targetUserId: userId, status: { in: ['pending', 'approved'] } },
    orderBy: { createdAt: 'desc' },
    include: { requestedBy: { select: { firstName: true, lastName: true } } },
  });
  return rows
    .map((r) => ({ r, status: effectiveStatus(r, now) }))
    .filter(({ status }) => status === 'pending' || status === 'approved')
    .map(({ r, status }) => ({
      id: r.id,
      status,
      mode: r.mode,
      durationMinutes: r.durationMinutes,
      reason: r.reason,
      staffName: `${r.requestedBy.firstName} ${r.requestedBy.lastName}`.trim(),
      requestExpiresAt: r.requestExpiresAt,
      accessEndsAt: r.accessEndsAt,
    }));
}

export async function decideByCustomer(userId: string, requestId: string, decision: 'approve' | 'reject' | 'end'): Promise<{ success: true } | { success: false; error: string }> {
  const r = await prisma.supportAccessRequest.findFirst({ where: { id: requestId, targetUserId: userId } });
  if (!r) return { success: false, error: 'Request not found.' };
  const status = effectiveStatus(r);
  if (decision === 'end') {
    if (status !== 'approved' && status !== 'pending') return { success: false, error: 'This access is no longer active.' };
    await closeRequest(r.id, status === 'pending' ? 'rejected' : 'ended', 'customer');
    return { success: true };
  }
  if (status !== 'pending') return { success: false, error: 'This request is no longer pending.' };
  if (decision === 'reject') {
    await prisma.supportAccessRequest.update({ where: { id: r.id }, data: { status: 'rejected', decidedAt: new Date() } });
    return { success: true };
  }
  const now = new Date();
  await prisma.supportAccessRequest.update({ where: { id: r.id }, data: { status: 'approved', decidedAt: now, accessEndsAt: new Date(now.getTime() + r.durationMinutes * MINUTE) } });
  return { success: true };
}

// The customer app exchanges the one-time code for a session as the user who accepted. Single use:
// the code is cleared in the same update that checks it.
export async function redeemEntryCode(code: string): Promise<{ success: true; token: string; expiresAt: Date } | { success: false; error: string }> {
  if (!code || code.length < 20) return { success: false, error: 'Invalid code.' };
  const now = new Date();
  const r = await prisma.supportAccessRequest.findFirst({ where: { entryCodeHash: hash(code) } });
  if (!r || !r.entryCodeExpires || r.entryCodeExpires < now) return { success: false, error: 'This support link expired. Open it again from the Admin.' };
  const cleared = await prisma.supportAccessRequest.updateMany({ where: { id: r.id, entryCodeHash: hash(code) }, data: { entryCodeHash: null, entryCodeExpires: null } });
  if (cleared.count === 0 || effectiveStatus(r, now) !== 'approved' || !r.accessEndsAt) return { success: false, error: 'This access is no longer active.' };
  const token = randomBytes(SESSION_TOKEN_BYTES).toString('hex');
  await prisma.session.create({
    data: { token, userId: r.targetUserId, expiresAt: r.accessEndsAt, supportAccessRequestId: r.id, supportReadOnly: r.mode !== 'edit' },
  });
  return { success: true, token, expiresAt: r.accessEndsAt };
}
