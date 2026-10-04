import prisma from '../../lib/prisma.js';
import { verifyPassword } from '../auth/authService.js';
import { sendAccountDeletionScheduledEmail } from '../../lib/mailer.js';
import type { Actor, AdminActionResult } from './adminActionService.js';

// Admin Center v2, stage 5 (2026-10-04): deleting a client's account. Requested either by
// Northstack staff from the Admin or by the client's owner from the app — 10 days either way
// (Alejandro, 2026-10-04). From that moment nobody of the client can log in (authenticateToken
// rejects a tenant with deletionScheduledAt) and their sessions are dropped; until the date,
// staff can undo it from the Admin ("Cancelar eliminación").

export const DELETION_GRACE_DAYS = 10;
const DAY = 24 * 60 * 60 * 1000;

async function audit(actor: Actor, tenantId: string, action: string, reason: string, details: Record<string, unknown>) {
  await prisma.platformAuditEntry.create({ data: { actorUserId: actor.id, tenantId, action, reason, details: details as object } });
}

export async function scheduleTenantDeletion(tenantId: string, confirmName: string, actor: Actor, reason: string): Promise<AdminActionResult> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { subscription: true } });
  if (!tenant) return { success: false, error: 'Ese cliente no existe.' };
  if (tenant.deletionScheduledAt) return { success: false, error: 'Ya está marcado para eliminarse.' };
  if (confirmName.trim() !== tenant.name.trim()) return { success: false, error: 'El nombre no coincide.' };
  const sub = tenant.subscription;
  if (sub?.provider && (sub.status === 'active' || sub.status === 'past_due') && !sub.cancelledAt) {
    return { success: false, error: 'Tiene una suscripción paga activa: primero hay que cancelarla (el cliente desde Facturación, o desde el panel de Dodo / Mercado Pago), si no se le sigue cobrando.' };
  }
  const when = new Date(Date.now() + DELETION_GRACE_DAYS * DAY);
  await prisma.$transaction([
    prisma.tenant.update({ where: { id: tenantId }, data: { deletionScheduledAt: when } }),
    prisma.session.deleteMany({ where: { user: { tenantId } } }),
  ]);
  await audit(actor, tenantId, 'delete_scheduled', reason, { name: tenant.name, eraseAfter: when.toISOString(), by: 'staff' });
  await notifyOwners(tenantId, tenant.name, when);
  return { success: true, message: `Cuenta bloqueada: nadie del cliente puede entrar. Se borra el ${when.toISOString().slice(0, 10)}; hasta entonces lo podés deshacer.` };
}

async function notifyOwners(tenantId: string, tenantName: string, when: Date) {
  const owners = await prisma.user.findMany({ where: { tenantId, role: 'owner', platformRole: null }, select: { email: true, locale: true } });
  for (const o of owners) await sendAccountDeletionScheduledEmail({ to: o.email, tenantName, deleteOn: when, locale: o.locale });
}

// The client's owner deletes their own company account from the app (Settings → Company), with
// their password and the company name as confirmation. Same 10 days and same blocking as above.
export async function requestDeletionByOwner(
  user: { id: string; tenantId: string | null; passwordHash: string; roleContext: { isOwner: boolean }; support?: unknown },
  input: { confirmName?: unknown; password?: unknown },
): Promise<{ success: true; deleteOn: Date } | { success: false; error: string; field?: string }> {
  if (!user.tenantId) return { success: false, error: 'No company account.' };
  if (user.support) return { success: false, error: 'Not available in a support session.' };
  if (!user.roleContext.isOwner) return { success: false, error: 'Only the owner can delete the company account.' };
  const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId }, include: { subscription: true } });
  if (!tenant) return { success: false, error: 'No company account.' };
  if (tenant.deletionScheduledAt) return { success: false, error: 'This account is already scheduled for deletion.' };
  if (typeof input.confirmName !== 'string' || input.confirmName.trim() !== tenant.name.trim()) {
    return { success: false, error: 'The company name does not match.', field: 'confirmName' };
  }
  if (typeof input.password !== 'string' || !verifyPassword(input.password, user.passwordHash)) {
    return { success: false, error: 'Wrong password.', field: 'password' };
  }
  const sub = tenant.subscription;
  if (sub?.provider && (sub.status === 'active' || sub.status === 'past_due') && !sub.cancelledAt) {
    return { success: false, error: 'Cancel your subscription in Settings → Billing first, so you are not charged again.', field: 'subscription' };
  }
  const when = new Date(Date.now() + DELETION_GRACE_DAYS * DAY);
  await prisma.$transaction([
    prisma.tenant.update({ where: { id: tenant.id }, data: { deletionScheduledAt: when } }),
    prisma.session.deleteMany({ where: { user: { tenantId: tenant.id } } }),
  ]);
  await audit({ id: user.id, email: '' }, tenant.id, 'delete_requested_by_owner', 'Pedido por el dueño desde la app', { name: tenant.name, eraseAfter: when.toISOString(), by: 'owner' });
  await notifyOwners(tenant.id, tenant.name, when);
  return { success: true, deleteOn: when };
}

export async function cancelTenantDeletion(tenantId: string, actor: Actor, reason: string): Promise<AdminActionResult> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { deletionScheduledAt: true, name: true } });
  if (!tenant) return { success: false, error: 'Ese cliente no existe.' };
  if (!tenant.deletionScheduledAt) return { success: false, error: 'No está marcado para eliminarse.' };
  await prisma.tenant.update({ where: { id: tenantId }, data: { deletionScheduledAt: null } });
  await audit(actor, tenantId, 'delete_cancelled', reason, { name: tenant.name });
  return { success: true, message: 'Eliminación cancelada: el cliente vuelve a poder entrar.' };
}
