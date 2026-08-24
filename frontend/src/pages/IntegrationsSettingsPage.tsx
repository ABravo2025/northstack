import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type GoogleCalendarStatus } from '../api';
import { useToast } from '../components/common/ToastProvider';

interface IntegrationsSettingsPageProps {
  token: string;
}

// Google's official 4-color "G" mark — standard on any "Connect/Sign in with
// Google" button per Google's own brand guidelines.
function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12
        c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24
        c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
      />
      <path
        fill="#FF3D00"
        d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039
        l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36
        c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
      />
      <path
        fill="#1976D2"
        d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571
        c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24
        C44,22.659,43.862,21.35,43.611,20.083z"
      />
    </svg>
  );
}

// The one home for every integration (2026-08-24) — reachable by every
// role, not just admin/owner, since the first one (Google Calendar) is a
// personal per-user connection: each person only ever sees and controls
// their own. Future tenant-wide integrations (Slack, outbound webhooks,
// etc. — previously a separate disabled "Coming soon" tile under Company)
// belong here too rather than a second entry point; gate an individual card
// by role if one ends up admin-only, don't split the page.
export default function IntegrationsSettingsPage({ token }: IntegrationsSettingsPageProps) {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [googleStatus, setGoogleStatus] = useState<GoogleCalendarStatus | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  const loadGoogleStatus = () => {
    api
      .getGoogleCalendarStatus(token)
      .then(setGoogleStatus)
      .catch((error) => toast.error('Failed to load Google Calendar status: ' + (error as Error).message));
  };

  useEffect(() => {
    loadGoogleStatus();

    if (searchParams.get('googleCalendarConnected')) {
      toast.success('Google Calendar connected.');
      setSearchParams({}, { replace: true });
    } else if (searchParams.get('googleCalendarError')) {
      toast.error('Could not connect Google Calendar. Please try again.');
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoogleConnect = async () => {
    setGoogleBusy(true);
    try {
      const { url } = await api.getGoogleCalendarConnectUrl(token);
      window.location.href = url;
    } catch (error) {
      toast.error('Failed to start Google Calendar connection: ' + (error as Error).message);
      setGoogleBusy(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    setGoogleBusy(true);
    try {
      await api.disconnectGoogleCalendar(token);
      toast.success('Google Calendar disconnected.');
      loadGoogleStatus();
    } catch (error) {
      toast.error('Failed to disconnect Google Calendar: ' + (error as Error).message);
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <div className="max-w-6xl">
      <div className="card">
        <div className="integration-header">
          <GoogleLogo className="integration-logo" />
          <div>
            <h3 className="card-title" style={{ margin: 0 }}>
              Google Calendar
            </h3>
            <p className="text-xs text-gray-400">
              Push your task due dates and approved time off to your personal Google Calendar, so
              Google's own reminders notify you.
            </p>
          </div>
        </div>

        {googleStatus?.connected ? (
          <div className="integration-status-row">
            <div className="flex items-center gap-2">
              <span
                className={`integration-status-dot ${googleStatus.needsReconnect ? 'integration-status-dot-warn' : 'integration-status-dot-ok'}`}
              />
              <div>
                <div className="text-sm font-medium">{googleStatus.googleAccountEmail}</div>
                {googleStatus.needsReconnect ? (
                  <div className="field-error">Access was revoked — reconnect to resume syncing.</div>
                ) : (
                  <div className="text-xs text-gray-400">Connected</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {googleStatus.needsReconnect && (
                <button type="button" className="btn-primary btn-md" onClick={handleGoogleConnect} disabled={googleBusy}>
                  Reconnect
                </button>
              )}
              <button type="button" className="btn-danger btn-md" onClick={handleGoogleDisconnect} disabled={googleBusy}>
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn-google btn-md" onClick={handleGoogleConnect} disabled={googleBusy}>
            <GoogleLogo className="h-4 w-4" />
            {googleBusy ? 'Connecting…' : 'Connect Google Calendar'}
          </button>
        )}
      </div>
    </div>
  );
}
