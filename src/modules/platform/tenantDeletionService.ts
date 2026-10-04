import prisma from '../../lib/prisma.js';
import type { Actor, AdminActionResult } from './adminActionService.js';

// Admin Center v2, stage 5 (2026-10-04): "Eliminar cliente", first step. Marks the client for
// deletion: from that moment nobody of the client can log in (authenticateToken rejects a tenant
// with deletionScheduledAt) and their sessions are dropped. Nothing is erased here; cancelling
// clears the date and everything is back as it was. Actually erasing the data after the grace
// period is a separate, still pending decision (see spec-admin-center-v2.md).

export const DELETION_GRACE_DAYS = 30;
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
  await audit(actor, tenantId, 'delete_scheduled', reason, { name: tenant.name, eraseAfter: when.toISOString() });
  return { success: true, message: `Cuenta bloqueada: nadie del cliente puede entrar. Se puede deshacer hasta el ${when.toISOString().slice(0, 10)}.` };
}

export async function cancelTenantDeletion(tenantId: string, actor: Actor, reason: string): Promise<AdminActionResult> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { deletionScheduledAt: true, name: true } });
  if (!tenant) return { success: false, error: 'Ese cliente no existe.' };
  if (!tenant.deletionScheduledAt) return { success: false, error: 'No está marcado para eliminarse.' };
  await prisma.tenant.update({ where: { id: tenantId }, data: { deletionScheduledAt: null } });
  await audit(actor, tenantId, 'delete_cancelled', reason, { name: tenant.name });
  return { success: true, message: 'Eliminación cancelada: el cliente vuelve a poder entrar.' };
}
