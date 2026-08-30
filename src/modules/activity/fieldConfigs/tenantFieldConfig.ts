import type { ActivityFieldConfigMap } from '../activityLogService.js';

// Scoped to the fields real callers actually touch today (tenantService.ts's
// updateTenantCurrency, planService.ts's updateTenantPlan) and that TENANT_SUMMARY_SELECT
// (tenantSummary.ts) actually returns — not every Tenant column. Tenant creation itself
// (registerTenantWithOwner) isn't logged: the acting "user" is the owner being created in the
// very same transaction, before they exist to be an actor.
export const tenantActivityFieldConfig: ActivityFieldConfigMap = {
  currency: { label: 'Currency' },
  plan: { label: 'Plan' },
};
