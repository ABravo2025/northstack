import type express from 'express';
import { canManagePayments } from '../modules/auth/permissionService.js';
import type { validateSession } from './httpAuth.js';

export type SessionUser = NonNullable<Awaited<ReturnType<typeof validateSession>>>;

// Shared by routes/payments.ts and routes/stripeIntegration.ts — both gate on the same
// owner-only canManagePayments check, just with a message tailored to what's being guarded.
export function requirePaymentsAccess(user: SessionUser, res: express.Response, message: string): boolean {
  if (!canManagePayments(user.role)) {
    res.status(403).json({ error: message });
    return false;
  }
  return true;
}
