import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { canViewSalesLeaderboard } from '../modules/auth/permissionService.js';
import { getHrMetrics } from '../modules/metrics/hrMetricsService.js';
import { getTimeOffMetrics } from '../modules/metrics/timeOffMetricsService.js';
import { getPayrollMetrics } from '../modules/metrics/payrollMetricsService.js';
import { getSalesMetrics } from '../modules/metrics/salesMetricsService.js';
import { getTasksMetrics } from '../modules/metrics/tasksMetricsService.js';
import { getAdoptionMetrics } from '../modules/metrics/adoptionMetricsService.js';

export const tenantMetricsRouter = createAsyncRouter();

const DEFAULT_MONTHS_BACK = 6;
const MAX_MONTHS_BACK = 24;

function parseMonthsBack(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_MONTHS_BACK) return DEFAULT_MONTHS_BACK;
  return n;
}

// One combined snapshot for a tenant's own data (docs/metrics/tenant-metrics-spec.md) —
// covers every metric marked "Hoy" (calculable now, no schema changes) in that
// catalog. Deliberately read-only/aggregate, no per-record sensitive data
// except `sales.dealsByOwner`, stripped below for anyone who isn't owner/admin.
tenantMetricsRouter.get('/api/tenant-metrics/overview', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const monthsBack = parseMonthsBack(req.query.months);
  const tenantId = user.tenantId!;

  const [hr, timeOff, payroll, sales, tasks, adoption] = await Promise.all([
    getHrMetrics(tenantId, monthsBack),
    getTimeOffMetrics(tenantId, monthsBack),
    getPayrollMetrics(tenantId, monthsBack),
    getSalesMetrics(tenantId, monthsBack),
    getTasksMetrics(tenantId, monthsBack),
    getAdoptionMetrics(tenantId),
  ]);

  if (!canViewSalesLeaderboard(user.role)) {
    sales.dealsByOwner = [];
  }

  return res.json({ generatedAt: new Date().toISOString(), monthsBack, hr, timeOff, payroll, sales, tasks, adoption });
});
