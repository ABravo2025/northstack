import type { ActivityFieldConfigMap } from '../activityLogService.js';

// Deliberately narrow — apiKeyEncrypted is a secret; lastEventPollAt/needsAttention are
// background-managed (cron poll / no real acting user), not something a person changed.
export const stripeConnectionActivityFieldConfig: ActivityFieldConfigMap = {
  apiKeyMode: { label: 'Key mode' },
  stripeAccountId: { label: 'Stripe account' },
};
