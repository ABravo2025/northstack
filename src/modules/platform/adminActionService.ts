import { Prisma, type PlanTier, type TenantStatus } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { requestPasswordReset } from '../auth/authService.js';
import { getNextBillingDate, setNextBillingDate } from '../../lib/dodopayments.js';
import { sendPaymentMethodReminderEmail } from '../../lib/mailer.js';
import { toCsv } from '../../lib/csv.js';
import { buildZip } from '../../lib/zip.js';
import { exportCompaniesToCsv, exportContactsToCsv, exportEmployeesToCsv } from '../csv/csvService.js';
import { updateTenantPlan } from '../tenant/planService.js';
import { changePlan as changePaidPlan } from '../tenant/subscriptionSelfServeService.js';
import { GRACE_PERIOD_DAYS } from '../tenant/planTransitionService.js';
import { OVERRIDABLE_LIMITS, OVERRIDABLE_MODULES, activeOverride, type OverridableLimit, type OverridableModule, type PlanOverride } from '../tenant/planLimits.js';

// Admin Center v2, stage 2a (2026-10-03): actions Northstack staff can take on a client. Every one
// needs a written reason and leaves a PlatformAuditEntry (append-only). Each returns
// { success, error } like the rest of the tenant services — never throws for a business rule.

const DAY = 24 * 60 * 60 * 1000;

export type AdminActionResult = { success: true; message?: string } | { success: false; error: string };

export interface Actor {
  id: string;
  email: string;
}

async function audit(actor: Actor, tenantId: string | null, action: string, reason: string, details?: Prisma.InputJsonValue) {
  await prisma.platformAuditEntry.create({ data: { actorUserId: actor.id, tenantId, action, reason, details } });
}

export function cleanReason(reason: unknown): string | null {
  if (typeof reason !== 'string') return null;
  const trimmed = reason.trim();
  return trimmed.length >= 3 ? trimmed.slice(0, 500) : null;
}

// New trial end: counted from today if the trial already ended, from the current end otherwise.
export function extendedTrialEnd(current: Date | null, days: number, now: Date = new Date()): Date {
  const from = current && current > now ? current : now;
  return new Date(from.getTime() + days * DAY);
}

export async function extendTrial(tenantId: string, days: number, actor: Actor, reason: string): Promise<AdminActionResult> {
  if (!Number.isInteger(days) || days < 1 || days > 90) return { success: false, error: 'Elegí entre 1 y 90 días.' };
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { subscription: true } });
  if (!tenant) return { success: false, error: 'Ese cliente no existe.' };
  if (tenant.subscription?.provider) {
    return { success: false, error: 'Este cliente ya cargó un medio de pago: su prueba la maneja el proveedor de cobro.' };
  }
  if (tenant.status === 'cancelled') return { success: false, error: 'El cliente está cancelado.' };

  const trialEndsAt = extendedTrialEnd(tenant.trialEndsAt, days);
  await prisma.$transaction([
    prisma.tenant.update({ where: { id: tenantId }, data: { trialEndsAt, status: 'trialing', gracePeriodEndsAt: null } }),
    ...(tenant.subscription
      ? [prisma.subscription.update({ where: { tenantId }, data: { trialEndsAt, status: 'trialing', gracePeriodEndsAt: null } })]
      : []),
  ]);
  await audit(actor, tenantId, 'extend_trial', reason, { days, from: tenant.trialEndsAt?.toISOString() ?? null, to: trialEndsAt.toISOString(), previousStatus: tenant.status });
  return { success: true, message: `La prueba ahora vence el ${trialEndsAt.toISOString().slice(0, 10)}.` };
}

export async function changeClientPlan(tenantId: string, plan: PlanTier, actor: Actor, reason: string): Promise<AdminActionResult> {
  if (plan !== 'starter' && plan !== 'growth') return { success: false, error: 'Plan no disponible.' };
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { subscription: true } });
  if (!tenant) return { success: false, error: 'Ese cliente no existe.' };
  const from = tenant.plan;

  const sub = tenant.subscription;
  if (sub?.provider) {
    // A Mercado Pago upgrade on an active subscription needs the payer to authorize a new
    // preapproval (changePlan returns an init_point for the customer to open) — staff can't do
    // that for them, and it would be created with the staff member's email.
    if (sub.provider === 'mercadopago' && sub.status === 'active' && plan === 'growth' && sub.plan === 'starter') {
      return { success: false, error: 'En Mercado Pago el cliente tiene que autorizar el monto nuevo: pedile que pase a Growth desde Configuración → Facturación.' };
    }
    // Paying client: same path as the customer's own "Change plan" (provider updated; an upgrade
    // charges the difference now, a downgrade applies at the next renewal).
    const result = await changePaidPlan(tenantId, plan, actor);
    if (!result.success) return { success: false, error: result.error ?? 'No se pudo cambiar el plan.' };
    await audit(actor, tenantId, 'change_plan', reason, { from, to: plan, paid: true, outcome: result.outcome ?? null });
    const message =
      result.outcome === 'scheduled' ? 'El cambio se aplica en el próximo cobro.'
      : result.outcome === 'charging' ? 'Se está cobrando la diferencia; el plan cambia cuando el cobro se confirme.'
      : 'Plan cambiado.';
    return { success: true, message };
  }

  if (from === plan) return { success: false, error: 'Ya tiene ese plan.' };
  const result = await updateTenantPlan(tenantId, plan, actor.id);
  if (!result.success) return { success: false, error: result.error ?? 'No se pudo cambiar el plan.' };
  await audit(actor, tenantId, 'change_plan', reason, { from, to: plan, paid: false });
  return { success: true, message: 'Plan cambiado. Todavía no paga: el plan se cobra cuando cargue un medio de pago.' };
}

export async function suspendClient(tenantId: string, actor: Actor, reason: string): Promise<AdminActionResult> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { success: false, error: 'Ese cliente no existe.' };
  if (tenant.status === 'suspended') return { success: false, error: 'Ya está suspendido.' };
  if (tenant.status === 'cancelled') return { success: false, error: 'El cliente está cancelado.' };
  await prisma.tenant.update({ where: { id: tenantId }, data: { status: 'suspended' } });
  await audit(actor, tenantId, 'suspend', reason, { previousStatus: tenant.status });
  return { success: true, message: 'Cuenta suspendida: pueden entrar y ver, pero no cambiar nada.' };
}

// Where a reactivated client goes back to. Null = nothing valid (an expired trial with no payment
// method): extend the trial instead.
export function reactivationStatus(
  tenant: { trialEndsAt: Date | null },
  sub: { provider: string | null; status: string } | null,
  now: Date = new Date(),
): TenantStatus | null {
  if (sub?.provider) return sub.status === 'past_due' ? 'past_due' : 'active';
  if (tenant.trialEndsAt && tenant.trialEndsAt > now) return 'trialing';
  return null;
}

export async function reactivateClient(tenantId: string, actor: Actor, reason: string): Promise<AdminActionResult> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { subscription: true } });
  if (!tenant) return { success: false, error: 'Ese cliente no existe.' };
  if (tenant.status !== 'suspended') return { success: false, error: 'No está suspendido.' };
  const next = reactivationStatus(tenant, tenant.subscription);
  if (!next) return { success: false, error: 'La prueba está vencida y no tiene medio de pago: usá "Extender prueba", que también la reactiva.' };
  const gracePeriodEndsAt = next === 'past_due' ? new Date(Date.now() + GRACE_PERIOD_DAYS * DAY) : null;
  await prisma.tenant.update({ where: { id: tenantId }, data: { status: next, gracePeriodEndsAt } });
  await audit(actor, tenantId, 'reactivate', reason, { status: next });
  return { success: true, message: 'Cuenta reactivada.' };
}

export async function sendPasswordReset(tenantId: string, userId: string, actor: Actor, reason: string): Promise<AdminActionResult> {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { email: true, status: true } });
  if (!user) return { success: false, error: 'Esa persona no es de este cliente.' };
  await requestPasswordReset(user.email);
  await audit(actor, tenantId, 'reset_password', reason, { userId, email: user.email });
  return { success: true, message: `Le mandamos a ${user.email} un link para elegir una contraseña nueva.` };
}

export async function listAudit(input: { tenantId?: string; take?: number }) {
  const rows = await prisma.platformAuditEntry.findMany({
    where: input.tenantId ? { tenantId: input.tenantId } : {},
    orderBy: { createdAt: 'desc' },
    take: Math.min(input.take ?? 200, 500),
    include: { actor: { select: { firstName: true, lastName: true } }, tenant: { select: { id: true, name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    action: r.action,
    reason: r.reason,
    details: r.details,
    actor: `${r.actor.firstName} ${r.actor.lastName}`.trim(),
    tenant: r.tenant,
  }));
}

// ---------------------------------------------------------------------------------------------
// Stage 2b: per-client agreements (modules on/off + limits), see planLimits.ts's PlanOverride.

export interface AgreementInput {
  modules?: Record<string, unknown>;
  limits?: Record<string, unknown>;
  expiresAt?: unknown;
}

// Validates what the Admin sends. Modules: true/false (absent or 'plan' = as the plan says).
// Limits: a whole number 0..10000, null = unlimited (not for freeTrialSeatCap), absent = the plan.
export function parseAgreement(input: AgreementInput, now: Date = new Date()): { ok: true; modules: PlanOverride['modules']; limits: PlanOverride['limits']; expiresAt: string | null } | { ok: false; error: string } {
  const modules: PlanOverride['modules'] = {};
  const limits: PlanOverride['limits'] = {};
  for (const [key, value] of Object.entries(input.modules ?? {})) {
    if (!OVERRIDABLE_MODULES.includes(key as OverridableModule)) return { ok: false, error: `Módulo desconocido: ${key}` };
    if (value === 'plan' || value === undefined) continue;
    if (typeof value !== 'boolean') return { ok: false, error: `Valor inválido para ${key}.` };
    modules[key as OverridableModule] = value;
  }
  for (const [key, value] of Object.entries(input.limits ?? {})) {
    if (!OVERRIDABLE_LIMITS.includes(key as OverridableLimit)) return { ok: false, error: `Límite desconocido: ${key}` };
    if (value === 'plan' || value === undefined || value === '') continue;
    if (value === null) {
      if (key === 'freeTrialSeatCap') return { ok: false, error: 'El tope de usuarios en prueba necesita un número.' };
      limits[key as OverridableLimit] = null;
      continue;
    }
    const n = typeof value === 'string' ? Number(value) : value;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 10000) return { ok: false, error: `Límite inválido para ${key}: usá un número entero.` };
    limits[key as OverridableLimit] = n;
  }
  let expiresAt: string | null = null;
  if (typeof input.expiresAt === 'string' && input.expiresAt.trim()) {
    const d = input.expiresAt.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) return { ok: false, error: 'Fecha de vencimiento inválida.' };
    if (Date.parse(`${d}T23:59:59.999Z`) < now.getTime()) return { ok: false, error: 'La fecha de vencimiento ya pasó.' };
    expiresAt = d;
  }
  return { ok: true, modules, limits, expiresAt };
}

export async function setAgreement(tenantId: string, input: AgreementInput, actor: Actor, reason: string): Promise<AdminActionResult> {
  const parsed = parseAgreement(input);
  if (!parsed.ok) return { success: false, error: parsed.error };
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { planOverride: true } });
  if (!tenant) return { success: false, error: 'Ese cliente no existe.' };
  const empty = Object.keys(parsed.modules).length === 0 && Object.keys(parsed.limits).length === 0;
  if (empty) return clearAgreement(tenantId, actor, reason);
  const value: PlanOverride = {
    modules: parsed.modules,
    limits: parsed.limits,
    reason,
    expiresAt: parsed.expiresAt,
    setAt: new Date().toISOString(),
    setByUserId: actor.id,
  };
  await prisma.tenant.update({ where: { id: tenantId }, data: { planOverride: value as unknown as Prisma.InputJsonValue } });
  await audit(actor, tenantId, 'set_agreement', reason, { before: tenant.planOverride ?? null, after: value as unknown as Prisma.InputJsonValue });
  return { success: true, message: 'Acuerdo guardado. Lo ven en su próxima carga de la app.' };
}

export async function clearAgreement(tenantId: string, actor: Actor, reason: string): Promise<AdminActionResult> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { planOverride: true } });
  if (!tenant) return { success: false, error: 'Ese cliente no existe.' };
  if (!tenant.planOverride) return { success: false, error: 'No tiene un acuerdo especial.' };
  await prisma.tenant.update({ where: { id: tenantId }, data: { planOverride: Prisma.DbNull } });
  await audit(actor, tenantId, 'clear_agreement', reason, { before: tenant.planOverride });
  return { success: true, message: 'Acuerdo quitado: vuelve a lo que da su plan.' };
}

export { activeOverride };

// ---------------------------------------------------------------------------------------------
// Stage 2c (2026-10-04): billing actions and data export.

const MAX_FREE_MONTHS = 12;

// "N months free": moves the next charge N months later in Dodo. Mercado Pago has no way to skip
// charges on a preapproval, so it's Dodo-only.
export async function grantFreeMonths(tenantId: string, months: number, actor: Actor, reason: string): Promise<AdminActionResult> {
  if (!Number.isInteger(months) || months < 1 || months > MAX_FREE_MONTHS) return { success: false, error: `Elegí entre 1 y ${MAX_FREE_MONTHS} meses.` };
  const sub = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!sub?.provider || !sub.externalSubscriptionId) return { success: false, error: 'Este cliente no tiene una suscripción paga.' };
  if (sub.provider !== 'dodopayments') {
    return { success: false, error: 'Mercado Pago no permite saltear cobros de una suscripción. Para clientes de Argentina, por ahora no hay meses gratis desde el Admin.' };
  }
  if (sub.status !== 'active') return { success: false, error: 'La suscripción no está activa (puede tener un pago pendiente).' };
  const current = await getNextBillingDate(sub.externalSubscriptionId);
  const target = addMonths(current, months);
  const confirmed = await setNextBillingDate(sub.externalSubscriptionId, target);
  await prisma.subscription.update({ where: { tenantId }, data: { currentPeriodEnd: confirmed } });
  await audit(actor, tenantId, 'free_months', reason, { months, from: current.toISOString(), to: confirmed.toISOString() });
  return { success: true, message: `Listo: el próximo cobro pasa al ${confirmed.toISOString().slice(0, 10)}.` };
}

// Same day N months later, clamped to the end of a shorter month (31 Jan + 1 = 28/29 Feb).
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

// Neither provider lets us force a retry; both retry on their own once the card is fixed. This
// emails the owner a link to Settings -> Billing.
export async function sendPaymentReminder(tenantId: string, actor: Actor, reason: string): Promise<AdminActionResult> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { subscription: true } });
  if (!tenant) return { success: false, error: 'Ese cliente no existe.' };
  if (!tenant.subscription?.provider) return { success: false, error: 'Este cliente todavía no cargó un medio de pago.' };
  const owners = await prisma.user.findMany({ where: { tenantId, status: 'active', role: 'owner' }, select: { email: true, locale: true } });
  if (owners.length === 0) return { success: false, error: 'No encontré al dueño de la cuenta.' };
  const billingUrl = `${process.env.APP_BASE_URL ?? 'https://app.joinnorthstack.com'}/settings/billing`;
  for (const o of owners) await sendPaymentMethodReminderEmail({ to: o.email, tenantName: tenant.name, billingUrl, locale: o.locale });
  await audit(actor, tenantId, 'payment_reminder', reason, { to: owners.map((o) => o.email) });
  return { success: true, message: `Mail enviado a ${owners.map((o) => o.email).join(', ')}.` };
}

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');
const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');

// One ZIP with a CSV per module (the same exports the customer has, plus users, time off,
// opportunities and tasks). Logged: it carries the client's personal data.
export async function exportClientData(
  tenantId: string,
  actor: Actor,
  reason: string,
): Promise<{ success: true; filename: string; zip: Buffer } | { success: false; error: string }> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true } });
  if (!tenant) return { success: false, error: 'Ese cliente no existe.' };

  const [employees, companies, contacts, users, timeOff, opportunities, tasks] = await Promise.all([
    exportEmployeesToCsv(tenantId),
    exportCompaniesToCsv(tenantId),
    exportContactsToCsv(tenantId),
    prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { firstName: true, lastName: true, email: true, role: true, status: true, createdAt: true, lastSeenAt: true },
    }),
    prisma.timeOffRequest.findMany({
      where: { tenantId },
      orderBy: { startDate: 'asc' },
      select: {
        startDate: true, endDate: true, daysRequested: true, status: true, note: true, decidedAt: true, decisionNote: true, createdAt: true,
        employee: { select: { firstName: true, lastName: true } },
        timeOffPolicy: { select: { name: true } },
      },
    }),
    prisma.opportunity.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: {
        name: true, amountCents: true, currency: true, estimatedCloseDate: true, isActive: true, createdAt: true,
        company: { select: { name: true } },
        pipeline: { select: { name: true } },
        stage: { select: { name: true } },
        owner: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.task.findMany({
      where: { tenantId, entityType: { not: 'tenant' } }, // staff notes about the client never leave the Admin
      orderBy: { createdAt: 'asc' },
      select: { title: true, description: true, dueDate: true, completedAt: true, createdAt: true, assignee: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const files = [
    { name: 'personas.csv', content: employees },
    { name: 'empresas.csv', content: companies },
    { name: 'contactos.csv', content: contacts },
    {
      name: 'usuarios.csv',
      content: toCsv([['Nombre', 'Email', 'Rol', 'Estado', 'Alta', 'Última actividad'], ...users.map((u) => [fullName(u), u.email, u.role, u.status, ymd(u.createdAt), ymd(u.lastSeenAt)])]),
    },
    {
      name: 'ausencias.csv',
      content: toCsv([
        ['Persona', 'Política', 'Desde', 'Hasta', 'Días', 'Estado', 'Nota', 'Decidida', 'Nota de decisión', 'Pedida'],
        ...timeOff.map((r) => [fullName(r.employee), r.timeOffPolicy?.name ?? '', ymd(r.startDate), ymd(r.endDate), r.daysRequested, r.status, r.note ?? '', ymd(r.decidedAt), r.decisionNote ?? '', ymd(r.createdAt)]),
      ]),
    },
    {
      name: 'oportunidades.csv',
      content: toCsv([
        ['Oportunidad', 'Empresa', 'Pipeline', 'Etapa', 'Monto', 'Moneda', 'Cierre estimado', 'Responsable', 'Activa', 'Creada'],
        ...opportunities.map((o) => [o.name, o.company?.name ?? '', o.pipeline?.name ?? '', o.stage?.name ?? '', (o.amountCents / 100).toFixed(2), o.currency, ymd(o.estimatedCloseDate), fullName(o.owner), o.isActive ? 'sí' : 'no', ymd(o.createdAt)]),
      ]),
    },
    {
      name: 'tareas.csv',
      content: toCsv([['Tarea', 'Descripción', 'Responsable', 'Vence', 'Completada', 'Creada'], ...tasks.map((t) => [t.title, t.description ?? '', fullName(t.assignee), ymd(t.dueDate), ymd(t.completedAt), ymd(t.createdAt)])]),
    },
  ];
  const zip = buildZip(files);
  await audit(actor, tenantId, 'export_data', reason, { files: files.map((f) => f.name), bytes: zip.length });
  const date = new Date().toISOString().slice(0, 10);
  return { success: true, filename: `northstack-${tenant.slug || 'cliente'}-${date}.zip`, zip };
}
