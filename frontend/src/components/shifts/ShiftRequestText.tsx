import { useTranslation } from 'react-i18next';
import type { ShiftRequest, ShiftRequestShift } from '../../api';
import { formatDay, formatMinute } from '../../lib/shiftDates';

// One line that names a shift: "Thu 16 Oct · 09:00–13:00 · Lab Central".
export function useShiftLabel() {
  const { i18n } = useTranslation('shifts');
  return (s: ShiftRequestShift) =>
    `${formatDay(s.date, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })} · ${formatMinute(s.startMinute)}–${formatMinute(s.endMinute)} · ${s.location.name}`;
}

export const REQUEST_CHIP: Record<ShiftRequest['status'], string> = {
  open: 'to-chip-pending',
  pending_peer: 'to-chip-pending',
  pending_manager: 'to-chip-pending',
  approved: 'to-chip-approved',
  declined: 'to-chip-rejected',
  cancelled: 'to-chip-cancelled',
  expired: 'to-chip-cancelled',
};

// What a request is about, in a sentence (phase 2, block A).
export function ShiftRequestText({ request }: { request: ShiftRequest }) {
  const { t } = useTranslation('shifts');
  const label = useShiftLabel();
  const vars = {
    name: `${request.requestedBy.firstName} ${request.requestedBy.lastName}`,
    other: request.targetEmployee ? `${request.targetEmployee.firstName} ${request.targetEmployee.lastName}` : '',
    shift: label(request.shift),
    otherShift: request.targetShift ? label(request.targetShift) : '',
  };
  const key = request.type === 'claim' ? 'claim' : request.type === 'give' ? (request.targetEmployee ? 'giveTaken' : 'give') : 'swap';
  return <>{t(`requests.text.${key}`, vars)}</>;
}
