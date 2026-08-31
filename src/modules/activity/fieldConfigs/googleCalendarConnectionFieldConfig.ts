import type { ActivityFieldConfigMap } from '../activityLogService.js';

// Deliberately narrow — accessTokenEncrypted/refreshTokenEncrypted are secrets, and
// needsReconnect is a background-managed health flag (flipped by markNeedsReconnectIfRevoked,
// which has no real acting user) rather than something a person changed.
export const googleCalendarConnectionActivityFieldConfig: ActivityFieldConfigMap = {
  googleAccountEmail: { label: 'Google account' },
};
