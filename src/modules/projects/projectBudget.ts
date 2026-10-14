import prisma from '../../lib/prisma.js';
import i18n, { resolveEmailLocale } from '../../lib/i18n.js';
import { sendShiftRequestEmail } from '../../lib/mailer.js';
import { createNotification } from '../notifications/notificationService.js';

// Shifts phase 2, block C (spec-shifts-fase2.md §C, Growth): hours budgeted for a project against
// the hours logged to it in timesheets (any week status). The owner is told once when it crosses
// 80 % and once at 100 %; changing the budget resets that.

export const BUDGET_LEVELS = [80, 100] as const;

// Pure (tested): the highest threshold reached, 0 when none (or no budget).
export function budgetLevel(usedMinutes: number, budgetMinutes: number | null): number {
  if (!budgetMinutes || budgetMinutes <= 0) return 0;
  const pct = (usedMinutes / budgetMinutes) * 100;
  return [...BUDGET_LEVELS].reverse().find((l) => pct >= l) ?? 0;
}

export function parseBudgetMinutes(value: unknown): { ok: true; value: number | null | undefined } | { ok: false } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || value === '') return { ok: true, value: null };
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 1_000_000) return { ok: false };
  return { ok: true, value };
}

export async function usedMinutes(projectId: string): Promise<number> {
  const r = await prisma.timeEntry.aggregate({ where: { projectId }, _sum: { minutes: true } });
  return r._sum.minutes ?? 0;
}

export async function usedMinutesByProject(projectIds: string[]): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map();
  const rows = await prisma.timeEntry.groupBy({ by: ['projectId'], where: { projectId: { in: projectIds } }, _sum: { minutes: true } });
  return new Map(rows.map((r) => [r.projectId!, r._sum.minutes ?? 0]));
}

const appBaseUrl = () => process.env.APP_BASE_URL ?? 'http://localhost:5173';

// After hours are logged/changed on a project: tell the owner when a new threshold is crossed.
export async function checkProjectBudget(projectId: string | null): Promise<void> {
  if (!projectId) return;
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, tenantId: true, name: true, budgetMinutes: true, budgetNoticeLevel: true, ownerEmployee: { select: { user: { select: { id: true, email: true, firstName: true, locale: true, status: true } } } } },
    });
    if (!project?.budgetMinutes) return;
    const used = await usedMinutes(project.id);
    const level = budgetLevel(used, project.budgetMinutes);
    if (level <= project.budgetNoticeLevel) return;
    await prisma.project.update({ where: { id: project.id }, data: { budgetNoticeLevel: level } });
    const u = project.ownerEmployee.user;
    if (!u || u.status !== 'active') return;
    const lng = resolveEmailLocale(u.locale);
    const hours = (m: number) => `${Math.round((m / 60) * 10) / 10}h`;
    const message = i18n.t(level >= 100 ? 'shifts.budget.over' : 'shifts.budget.near', { lng, ns: 'emails', name: project.name, used: hours(used), budget: hours(project.budgetMinutes) });
    await createNotification({ tenantId: project.tenantId, userId: u.id, type: 'project_budget', entityType: 'project', entityId: project.id, message });
    await sendShiftRequestEmail({ to: u.email, locale: u.locale, firstName: u.firstName, message, url: `${appBaseUrl()}/projects/${project.id}`, category: 'projectBudget' });
  } catch (err) {
    console.error('checkProjectBudget failed:', err);
  }
}
