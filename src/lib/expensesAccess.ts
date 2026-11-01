import type express from 'express';
import { canManageExpenses } from '../modules/auth/permissionService.js';
import { isExpensesAllowed } from '../modules/tenant/planLimits.js';
import { isExpenseEncryptionConfigured } from './expenseEncryption.js';
import type { SessionUser } from './payrollAccess.js';

// Every Gastos route: the manage_expenses permission (owner-only by default), the Growth plan
// (or an Admin override), and the module's own encryption key — without the key nothing can be
// read or written, so the routes answer 503 with a clear message instead of failing per request.
export function requireExpensesAccess(user: SessionUser, res: express.Response): boolean {
  if (!canManageExpenses(user.roleContext)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return false;
  }
  if (!isExpensesAllowed(user.tenant)) {
    res.status(403).json({ error: 'Expenses requires the Growth plan. Upgrade to Growth to use Expenses.' });
    return false;
  }
  if (!isExpenseEncryptionConfigured()) {
    res.status(503).json({ error: 'Expenses is not configured yet.', code: 'expenses_not_configured' });
    return false;
  }
  return true;
}
