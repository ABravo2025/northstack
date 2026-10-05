import { useTranslation } from 'react-i18next';
import type { Shift } from '../../api';
import { formatDuration, formatMinute, shiftDurationMinutes } from '../../lib/shiftDates';

interface ShiftCardProps {
  shift: Shift;
  // 'location': the card lists the people on it; 'person': the card sits in that person's row, so
  // it shows the location instead.
  mode: 'location' | 'person';
  onOpen: (shift: Shift) => void;
}

// People who still hold the shift (declined people free their slot).
export function filledSlots(shift: Shift): number {
  return shift.assignments.filter((a) => a.status !== 'declined').length;
}

// The card's left stripe: red when it needs someone (open slot or a decline), amber while answers
// are pending, green when everyone confirmed. Drafts and cancelled shifts have their own looks.
export function shiftTone(shift: Shift): 'draft' | 'cancelled' | 'bad' | 'warn' | 'ok' {
  if (shift.status === 'draft') return 'draft';
  if (shift.status === 'cancelled') return 'cancelled';
  if (shift.assignments.some((a) => a.status === 'declined') || filledSlots(shift) < shift.headcount) return 'bad';
  if (shift.assignments.some((a) => a.status === 'pending')) return 'warn';
  return 'ok';
}

export default function ShiftCard({ shift, mode, onOpen }: ShiftCardProps) {
  const { t } = useTranslation('shifts');
  const tone = shiftTone(shift);
  const open = shift.status === 'cancelled' ? 0 : Math.max(0, shift.headcount - filledSlots(shift));
  const time = `${formatMinute(shift.startMinute)}–${formatMinute(shift.endMinute)}`;
  const sub = mode === 'person' ? [shift.location.name, shift.position].filter(Boolean).join(' · ') : shift.position;

  return (
    <button type="button" className={`sh-card sh-${tone}`} onClick={() => onOpen(shift)} aria-label={`${time} ${shift.position ?? shift.location.name} · ${t(`status.${shift.status}`)}`}>
      <span className="sh-card-time">
        <span>
          {time}
          {shift.endsNextDay && '+1'}
        </span>
        <em>{formatDuration(shiftDurationMinutes(shift.startMinute, shift.endMinute))}</em>
      </span>
      {sub && <span className="sh-card-sub block">{sub}</span>}
      {mode === 'location' && shift.assignments.length > 0 && (
        <span className="sh-card-people">
          {shift.assignments.map((a) => (
            <span key={a.id} className="sh-person" title={t(`status.${shift.status === 'draft' ? 'notNotified' : a.status}`)}>
              <i className={`sh-dot sh-dot-${shift.status === 'draft' ? 'draft' : a.status}`} />
              <span>
                {a.employee.firstName} {a.employee.lastName}
              </span>
            </span>
          ))}
        </span>
      )}
      {open > 0 && <span className="sh-open block">{t('schedule.openSlots', { count: open })}</span>}
      {shift.status === 'draft' && <span className="sh-card-sub block">{t('status.draft')}</span>}
    </button>
  );
}
