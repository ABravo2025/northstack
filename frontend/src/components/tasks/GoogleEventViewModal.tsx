import { useTranslation } from 'react-i18next';
import Modal from '../common/Modal';
import type { GoogleCalendarViewEvent } from '../../api';

interface GoogleEventViewModalProps {
  event: GoogleCalendarViewEvent | null; // null = closed
  onClose: () => void;
}

function formatRange(event: GoogleCalendarViewEvent): string {
  const start = new Date(event.start);
  if (event.allDay) {
    return start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  const dateLabel = start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const startTime = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const endTime = event.end ? new Date(event.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
  return endTime ? `${dateLabel} · ${startTime} – ${endTime}` : `${dateLabel} · ${startTime}`;
}

// Read-only preview for a raw Google Calendar entry on the Overview calendar (2026-09-16) — these
// are personal events pulled straight from the user's own connected Google Calendar (never a
// Northstack Task, see listGoogleEventsForCalendarView's comment), so clicking one used to do
// nothing at all. This is deliberately just a viewer, not an editor: editing lives on
// calendar.google.com (the "Open in Google Calendar" link), since Northstack never owns this data.
export default function GoogleEventViewModal({ event, onClose }: GoogleEventViewModalProps) {
  const { t } = useTranslation('tasks');
  if (!event) return null;

  return (
    <Modal open={!!event} title={event.title} onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-ink-muted dark:text-dark-ink-muted">{formatRange(event)}</p>
        {event.location && <p className="text-ink-muted dark:text-dark-ink-muted">📍 {event.location}</p>}
        {event.description && <p className="whitespace-pre-wrap">{event.description}</p>}
        <div className="flex flex-wrap gap-3 pt-1">
          {event.hangoutLink && (
            <a href={event.hangoutLink} target="_blank" rel="noopener noreferrer" className="btn-primary text-center">
              {t('myTasks.actions.joinGoogleMeet')}
            </a>
          )}
          {event.htmlLink && (
            <a href={event.htmlLink} target="_blank" rel="noopener noreferrer" className="text-accent text-xs underline self-center">
              {t('myTasks.googleEvent.openInGoogleCalendar')}
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}
