import type { ActivityFieldConfigMap } from '../activityLogService.js';

// Scoped to the fields real callers actually touch today (planService.ts's
// updateTenantPlan, tenantProfileService.ts's company profile + currency + logo) and that TENANT_SUMMARY_SELECT
// (tenantSummary.ts) actually returns — not every Tenant column. Tenant creation itself
// (registerTenantWithOwner) isn't logged: the acting "user" is the owner being created in the
// very same transaction, before they exist to be an actor.
export const tenantActivityFieldConfig: ActivityFieldConfigMap = {
  currency: { label: 'Currency' },
  plan: { label: 'Plan' },
  name: { label: 'Company name' },
  legalName: { label: 'Legal name' },
  address: { label: 'Address' },
  phone: { label: 'Phone' },
  website: { label: 'Website' },
  companySize: { label: 'Company size' },
  industry: { label: 'Industry' },
  country: { label: 'Country' },
  logoUpdatedAt: {
    label: 'Logo',
    resolve: (value) => (value instanceof Date ? `Uploaded ${value.toISOString().slice(0, 16).replace('T', ' ')} UTC` : null),
  },
};
