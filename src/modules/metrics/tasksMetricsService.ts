import prisma from '../../lib/prisma.js';
import { lastNMonthKeys, median, monthKey, monthsAgoUtc, pct } from './mathUtils.js';

async function getCompletionStats(tenantId: string): Promise<{ completed: number; total: number; completionRatePct: number | null }> {
  const [total, completed] = await Promise.all([
    prisma.task.count({ where: { tenantId } }),
    prisma.task.count({ where: { tenantId, completedAt: { not: null } } }),
  ]);
  return { completed, total, completionRatePct: pct(completed, total) };
}

async function getOverdueCount(tenantId: string): Promise<number> {
  return prisma.task.count({ where: { tenantId, completedAt: null, dueDate: { lt: new Date() } } });
}

async function getMedianTimeToComplete(tenantId: string): Promise<{ medianHours: number; sampleSize: number }> {
  const completed = await prisma.task.findMany({
    where: { tenantId, completedAt: { not: null } },
    select: { createdAt: true, completedAt: true },
  });
  const hours = completed.map((t) => (t.completedAt!.getTime() - t.createdAt.getTime()) / 3600000);
  return { medianHours: Math.round(median(hours) * 10) / 10, sampleSize: hours.length };
}

async function getNotesVolume(tenantId: string, monthsBack: number): Promise<{ total: number; byMonth: { month: string; count: number }[] }> {
  const since = monthsAgoUtc(monthsBack - 1);
  const [total, recent] = await Promise.all([
    prisma.note.count({ where: { tenantId } }),
    prisma.note.findMany({ where: { tenantId, createdAt: { gte: since } }, select: { createdAt: true } }),
  ]);
  const months = lastNMonthKeys(monthsBack);
  const counts = new Map<string, number>(months.map((m) => [m, 0]));
  for (const n of recent) {
    const key = monthKey(n.createdAt);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return { total, byMonth: months.map((month) => ({ month, count: counts.get(month) ?? 0 })) };
}

export async function getTasksMetrics(tenantId: string, monthsBack = 6) {
  const [completion, overdueCount, timeToComplete, notes] = await Promise.all([
    getCompletionStats(tenantId),
    getOverdueCount(tenantId),
    getMedianTimeToComplete(tenantId),
    getNotesVolume(tenantId, monthsBack),
  ]);
  return { completion, overdueCount, timeToComplete, notes };
}
