// Dot color for a status. A status with no color picked yet falls back by meaning, so the
// built-in ones read right without anyone configuring them: Active green, Terminated red.
export const STATUS_ACTIVE_COLOR = '#059669';
export const STATUS_TERMINATED_COLOR = '#dc2626';
const STATUS_NEUTRAL_COLOR = '#6b7280';

export function statusColor(status: { color?: string | null; name?: string; isTerminatedStatus?: boolean } | null | undefined): string {
  if (!status) return STATUS_NEUTRAL_COLOR;
  if (status.color) return status.color;
  if (status.isTerminatedStatus) return STATUS_TERMINATED_COLOR;
  if (status.name === 'Active') return STATUS_ACTIVE_COLOR;
  return STATUS_NEUTRAL_COLOR;
}
