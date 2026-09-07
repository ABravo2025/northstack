import type express from 'express';
import { canManagePayments } from '../modules/auth/permissionService.js';
import { isPaymentsAllowed } from '../modules/tenant/planLimits.js';
import type { validateSession } from './httpAuth.js';

export type SessionUser = NonNullable<Awaited<ReturnType<typeof validateSession>>>;

// Shared by routes/payments.ts and routes/stripeIntegration.ts — both gate on the same
// owner-only canManagePayments check, just with a message tailored to what's being guarded.
// Plan-tier check (2026-09-07) layered in here too, not inside canManagePayments itself —
// that function is also reused by activityVisibilityService.ts's field-visibility map, a
// non-route call site where "blocked by plan" doesn't apply the same way.
export function requirePaymentsAccess(user: SessionUser, res: express.Response, message: string): boolean {
  if (!canManagePayments(user.roleContext)) {
    res.status(403).json({ error: message });
    return false;
  }
  if (!isPaymentsAllowed(user.tenant)) {
    res.status(403).json({ error: 'Payments requires the Growth plan. Upgrade to Growth to connect Stripe.' });
    return false;
  }
  return true;
}
