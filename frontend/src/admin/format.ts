import type { Attention, ClientStatus, ModuleKey, Plan } from './adminApi';

// Admin Center v2 is internal and Spanish-only (Alejandro is its only user for now).

export function money(cents: number, currency: string): string {
  const amount = cents / 100;
  return new Intl.NumberFormat(currency === 'ARS' ? 'es-AR' : 'en-US', {
    style: 'currency',
    currency,
    currencyDisplay: currency === 'ARS' ? 'code' : 'symbol',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function date(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ago(value: string | null | undefined): string {
  if (!value) return 'nunca';
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 15) return 'hace minutos';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'ayer' : `hace ${days} días`;
}

export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
}

export const STATUS: Record<ClientStatus, { label: string; tone: Tone }> = {
  trialing: { label: 'En prueba', tone: 'info' },
  expired: { label: 'Prueba vencida', tone: 'neutral' },
  no_plan: { label: 'Sin plan', tone: 'neutral' },
  active: { label: 'Activo', tone: 'good' },
  cancelling: { label: 'Cancela al vencer', tone: 'warn' },
  past_due: { label: 'Pago fallido', tone: 'bad' },
  suspended: { label: 'Suspendido', tone: 'neutral' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
};

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral' | 'accent';

export const TONE_CLASS: Record<Tone, string> = {
  good: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  warn: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  bad: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  info: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  neutral: 'bg-surface-2 text-ink-muted dark:bg-dark-raised dark:text-dark-ink-muted',
  accent: 'bg-accent-tint text-accent dark:text-brand-blue-light',
};

export const TONE_COLOR: Record<Tone, string> = {
  good: '#059669',
  warn: '#d97706',
  bad: '#e11d48',
  info: '#0284c7',
  neutral: '#8f8aa8',
  accent: '#5b21e6',
};

export function healthTone(score: number): Tone {
  return score >= 70 ? 'good' : score >= 40 ? 'warn' : 'bad';
}

export function planLabel(plan: Plan): string {
  return plan === 'growth' ? 'Growth' : plan === 'starter' ? 'Starter' : plan === 'scale' ? 'Scale' : 'Sin plan';
}

export const MODULE_LABEL: Record<ModuleKey, string> = {
  people: 'Personas',
  timeoff: 'Ausencias',
  sales: 'Ventas (CRM)',
  tasks: 'Tareas y notas',
  payroll: 'Nómina',
  payments: 'Pagos',
};

export function attentionText(a: Attention): { title: string; detail: string } {
  switch (a.kind) {
    case 'payment_failed':
      return { title: 'Pago fallido', detail: 'El último cobro fue rechazado.' };
    case 'trial_ending':
      return {
        title: a.daysLeft !== undefined && a.daysLeft <= 0 ? 'La prueba venció' : `La prueba vence en ${a.daysLeft} ${a.daysLeft === 1 ? 'día' : 'días'}`,
        detail: 'Todavía no eligió plan.',
      };
    case 'grace':
      return { title: 'En período de gracia', detail: `Se suspende en ${a.daysLeft} días si no paga.` };
    case 'inactive':
      return { title: `Sin actividad hace ${a.days} días`, detail: 'Nadie del equipo entró a la app.' };
    case 'cancelling':
      return { title: 'Pidió cancelar', detail: 'Sigue activo hasta el fin del período pago.' };
  }
}
