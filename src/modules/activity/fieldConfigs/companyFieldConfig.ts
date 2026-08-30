import type { ActivityFieldConfigMap } from '../activityLogService.js';
import { resolveCatalogName, resolveCompanyName, resolveUserName } from './resolvers.js';

// statusId is deliberately not tracked here — Company.statusId is never set by these functions
// (see companyService.ts's UpdateCompanyInput comment: it's derived from business events like an
// Opportunity reaching a `won` stage, via opportunityService.ts's maybeAdvanceCompanyToCustomer,
// which doesn't go through updateCompany). isPlaceholder is also left out — an internal
// "still needs a human to fill in real details" flag, not something meaningful to show as a field
// change in an activity feed.
export const companyActivityFieldConfig: ActivityFieldConfigMap = {
  name: { label: 'Name' },
  industry: { label: 'Industry' },
  website: { label: 'Website' },
  phone: { label: 'Phone' },
  billingAddress: { label: 'Billing address' },
  sizeId: { label: 'Size', resolve: resolveCatalogName },
  accountOwnerId: { label: 'Account owner', resolve: resolveUserName },
  // Self-referential (Company.parentCompanyId -> Company) — resolveCompanyName queries Prisma
  // directly rather than companyService.findCompanyById to sidestep an import cycle with this
  // very file's caller (companyService.ts).
  parentCompanyId: { label: 'Parent company', resolve: resolveCompanyName },
};
