import type { ActivityFieldConfigMap } from '../activityLogService.js';

// Deliberately narrow — provider/externalSubscriptionId/lockedPriceCents/currency/
// paymentMethodBrand/Last4 are internal/noisy, not human-meaningful diffs. cancelledAt is
// skipped too: its value is always ~now at request time, redundant with the ActivityLogEntry's
// own changedAt timestamp — cancellationEffectiveAt (the date it actually takes effect) is the
// one worth showing.
export const subscriptionActivityFieldConfig: ActivityFieldConfigMap = {
  plan: { label: 'Plan' },
  status: { label: 'Status' },
  cancellationReason: { label: 'Cancellation reason' },
  cancellationEffectiveAt: { label: 'Cancellation effective date' },
};
