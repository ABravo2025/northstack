import type express from 'express';
import { canManagePayroll } from '../modules/auth/permissionService.js';
import { isPayrollAllowed } from '../modules/tenant/planLimits.js';
import type { validateSession } from './httpAuth.js';

export type SessionUser = NonNullable<Awaited<ReturnType<typeof validateSession>>>;

// Shared by every Payroll route (routes/payroll.ts, routes/employees.ts) — collapses the
// existing `canManagePayroll` role check plus the plan-tier check (2026-09-07, Payroll is
// Growth-only) into one call, mirroring lib/paymentsAccess.ts's requirePaymentsAccess. Kept
// separate from canManagePayroll itself since that function is also reused by
// activityVisibilityService.ts/fieldVisibilityService.ts's field-visibility maps, non-route call
// sites where "blocked by plan" doesn't apply.
export function requirePayrollAccess(user: SessionUser, res: express.Response): boolean {
  if (!canManagePayroll(user.roleContext)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return false;
  }
  if (!isPayrollAllowed(user.tenant)) {
    res.status(403).json({ error: 'Payroll requires the Growth plan. Upgrade to Growth to use Payroll.' });
    return false;
  }
  return true;
}
