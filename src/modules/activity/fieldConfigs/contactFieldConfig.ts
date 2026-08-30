import type { ActivityFieldConfigMap } from '../activityLogService.js';
import { resolveCatalogName, resolveCompanyName } from './resolvers.js';

// isActive is deliberately not tracked as a field change here — deactivating a Contact (the "Delete"
// action in the UI, contactService.ts's deactivateContact) is logged as an `action: 'delete'` entry
// instead (see contactService.ts), same as any other entity's delete, not as an isActive: true -> false
// field change.
export const contactActivityFieldConfig: ActivityFieldConfigMap = {
  firstName: { label: 'First name' },
  lastName: { label: 'Last name' },
  email: { label: 'Email' },
  phone: { label: 'Phone' },
  companyId: { label: 'Company', resolve: resolveCompanyName },
  title: { label: 'Title' },
  isPrimary: { label: 'Primary contact' },
  leadStatus: { label: 'Lead status' },
  leadSourceId: { label: 'Lead source', resolve: resolveCatalogName },
};

export function contactDisplayName(record: { firstName: string; lastName: string }): string {
  return `${record.firstName} ${record.lastName}`;
}
