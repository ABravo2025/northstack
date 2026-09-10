import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { canManagePayroll, canViewDashboards, canViewSalesLeaderboard } from '../modules/auth/permissionService.js';
import { isPayrollAllowed } from '../modules/tenant/planLimits.js';
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
// is still salary data even aggregated) — both stripped below by role. `hr`/`timeOff`/
// `sales`/`tasks`/`adoption` are likewise nulled out for any role without `view_dashboards`
// (default Member doesn't have it — these are company-wide aggregates, not personal data) —
// the endpoint itself stays reachable for everyone regardless, since /overview's calendar/
// task-list features (out of scope for this gate) hit other endpoints, not this one.
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
  const canSeePayroll = canManagePayroll(user.roleContext) && isPayrollAllowed(user.tenant);
  const canSeeDashboards = canViewDashboards(user.roleContext);

  const [hr, timeOff, payroll, sales, tasks, adoption] = await Promise.all([
    canSeeDashboards ? getHrMetrics(tenantId, range) : Promise.resolve(null),
    canSeeDashboards ? getTimeOffMetrics(tenantId, range) : Promise.resolve(null),
    canSeePayroll ? getPayrollMetrics(tenantId, range) : Promise.resolve(null),
    canSeeDashboards ? getSalesMetrics(tenantId, range) : Promise.resolve(null),
    canSeeDashboards ? getTasksMetrics(tenantId, range) : Promise.resolve(null),
    canSeeDashboards ? getAdoptionMetrics(tenantId, range) : Promise.resolve(null),
  ]);

  if (sales && !canViewSalesLeaderboard(user.roleContext)) {
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
