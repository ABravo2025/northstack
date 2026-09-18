import { useEffect, useState } from 'react';
import { api } from '../api';

// Whether the tenant's Google Calendar connection can actually produce a Meet link right now —
// every surface that offers TaskForm's "Add Google Meet video call" checkbox needs this so
// checking it without a real connection doesn't silently set hasVideoCall on a Task that can
// never get a link (see TaskForm.tsx's googleCalendarConnected prop).
export function useGoogleCalendarConnected(token: string): boolean {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    api
      .getGoogleCalendarStatus(token)
      .then((status) => setConnected(status.connected && !status.needsReconnect))
      .catch(() => setConnected(false));
  }, [token]);

  return connected;
}
