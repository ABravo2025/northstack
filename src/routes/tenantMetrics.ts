import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { canManagePayroll, canViewSalesLeaderboard } from '../modules/auth/permissionService.js';
import { parseDateRange } from '../modules/metrics/dateRange.js';
import { getHrMetrics } from '../modules/metrics/hrMetricsService.js';
import { getTimeOffMetrics } from '../modules/metrics/timeOffMetricsService.js';
import { getPayrollMetrics } from '../modules/metrics/payrollMetricsService.js';
import { getSalesMetrics } from '../modules/metrics/salesMetricsService.js';
import { getTasksMetrics } from '../modules/metrics/tasksMetricsService.js';
import { getAdoptionMetrics } from '../modules/metrics/adoptionMetricsService.js';

export const tenantMetricsRouter = createAsyncRouter();

// One combined snapshot for a tenant's own data (docs/metrics/tenant-metrics-spec.md) —
// covers every metric marked "Hoy" (calculable now, no schema changes) in that
// catalog. Deliberately read-only/aggregate, no per-record sensitive data
// except `sales.dealsByOwner` (owner/admin only) and `payroll` as a whole
// (owner-only, same gate as the Payroll module itself — compensation-by-department
// is still salary data even aggregated) — both stripped below by role.
//
// ?since=<ISO>&until=<ISO> scopes every range-filterable metric (see each
// service's own comments for which fields are "current state" and stay
// unfiltered regardless — headcount, open pipeline, active compensation,
// etc.). Missing/invalid input falls back to the last 6 months.
tenantMetricsRouter.get('/api/tenant-metrics/overview', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const range = parseDateRange(req.query);
  const tenantId = user.tenantId!;
  const canSeePayroll = canManagePayroll(user.roleContext);

  const [hr, timeOff, payroll, sales, tasks, adoption] = await Promise.all([
    getHrMetrics(tenantId, range),
    getTimeOffMetrics(tenantId, range),
    canSeePayroll ? getPayrollMetrics(tenantId, range) : Promise.resolve(null),
    getSalesMetrics(tenantId, range),
    getTasksMetrics(tenantId, range),
    getAdoptionMetrics(tenantId, range),
  ]);

  if (!canViewSalesLeaderboard(user.roleContext)) {
    sales.dealsByOwner = [];
  }

  return res.json({
    generatedAt: new Date().toISOString(),
    range: { since: range.since.toISOString(), until: range.until.toISOString() },
    hr,
    timeOff,
    payroll,
    sales,
    tasks,
    adoption,
  });
});
