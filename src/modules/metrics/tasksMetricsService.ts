import prisma from '../../lib/prisma.js';
import { median, monthKey, monthKeysInRange, pct } from './mathUtils.js';
import type { DateRange } from './dateRange.js';

async function getCompletionStats(tenantId: string, range: DateRange): Promise<{ completed: number; total: number; completionRatePct: number | null }> {
  const [total, completed] = await Promise.all([
    prisma.task.count({ where: { tenantId, createdAt: { gte: range.since, lte: range.until } } }),
    prisma.task.count({ where: { tenantId, createdAt: { gte: range.since, lte: range.until }, completedAt: { not: null } } }),
  ]);
  return { completed, total, completionRatePct: pct(completed, total) };
}

// Not range-filtered — "how many are overdue" is a current-state question.
async function getOverdueCount(tenantId: string): Promise<number> {
  return prisma.task.count({ where: { tenantId, completedAt: null, dueDate: { lt: new Date() } } });
}

async function getMedianTimeToComplete(tenantId: string, range: DateRange): Promise<{ medianHours: number; sampleSize: number }> {
  const completed = await prisma.task.findMany({
    where: { tenantId, completedAt: { not: null, gte: range.since, lte: range.until } },
    select: { createdAt: true, completedAt: true },
  });
  const hours = completed.map((t) => (t.completedAt!.getTime() - t.createdAt.getTime()) / 3600000);
  return { medianHours: Math.round(median(hours) * 10) / 10, sampleSize: hours.length };
}

async function getNotesVolume(tenantId: string, range: DateRange): Promise<{ total: number; byMonth: { month: string; count: number }[] }> {
  const [total, inWindow] = await Promise.all([
    prisma.note.count({ where: { tenantId } }),
    prisma.note.findMany({ where: { tenantId, createdAt: { gte: range.since, lte: range.until } }, select: { createdAt: true } }),
  ]);
  const months = monthKeysInRange(range.since, range.until);
  const counts = new Map<string, number>(months.map((m) => [m, 0]));
  for (const n of inWindow) {
    const key = monthKey(n.createdAt);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return { total, byMonth: months.map((month) => ({ month, count: counts.get(month) ?? 0 })) };
}

export async function getTasksMetrics(tenantId: string, range: DateRange) {
  const [completion, overdueCount, timeToComplete, notes] = await Promise.all([
    getCompletionStats(tenantId, range),
    getOverdueCount(tenantId),
    getMedianTimeToComplete(tenantId, range),
    getNotesVolume(tenantId, range),
  ]);
  return { completion, overdueCount, timeToComplete, notes };
}
