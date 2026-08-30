import type { ActivityFieldConfigMap } from '../activityLogService.js';
import { resolveMoney, resolvePayFrequencyName, resolvePaymentMethodName } from './resolvers.js';

// Deliberately excludes paymentAccountDataEncrypted (ciphertext, never worth surfacing even
// encrypted), contractPdf (binary), and confirmedIp (not a field change a person made). Create-only
// — EmployeeCompensation is versioned, never updated in place (see employeeCompensationService.ts's
// createCompensation), so there's no update/delete action to log for this entity.
export const employeeCompensationActivityFieldConfig: ActivityFieldConfigMap = {
  compensationType: { label: 'Compensation type' },
  rateCents: { label: 'Rate', resolve: resolveMoney },
  currency: { label: 'Currency' },
  payFrequencyId: { label: 'Pay frequency', resolve: resolvePayFrequencyName },
  jobTitle: { label: 'Job title' },
  description: { label: 'Description' },
  effectiveFrom: { label: 'Effective from' },
  note: { label: 'Note' },
  paymentMethodId: { label: 'Payment method', resolve: resolvePaymentMethodName },
};
