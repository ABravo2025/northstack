import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type GoogleCalendarStatus } from '../api';
import { useToast } from '../components/common/ToastProvider';
import PasswordInput from '../components/common/PasswordInput';
import PasswordChecklist from '../components/common/PasswordChecklist';

interface ProfileSettingsPageProps {
  user: any;
  token: string;
  onUserUpdated: (user: any) => void;
}

export default function ProfileSettingsPage({ user, token, onUserUpdated }: ProfileSettingsPageProps) {
  const toast = useToast();
  const [profileForm, setProfileForm] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
  });
  const [profileError, setProfileError] = useState<{ message: string; field?: string } | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [passwordError, setPasswordError] = useState<{ message: string; field?: string } | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

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

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSaving(true);
    try {
      const result = await api.updateProfile(token, profileForm);
      onUserUpdated(result.user);
      toast.success('Profile updated.');
    } catch (error) {
      const field = (error as any).field;
      if (field) {
        setProfileError({ message: (error as Error).message, field });
      } else {
        toast.error((error as Error).message);
      }
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSaving(true);
    try {
      await api.changePassword(token, passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '' });
      toast.success('Password updated.');
    } catch (error) {
      const field = (error as any).field;
      if (field) {
        setPasswordError({ message: (error as Error).message, field });
      } else {
        toast.error((error as Error).message);
      }
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="max-w-6xl">
      <div className="card">
        <h3 className="card-title">Profile</h3>
        <form onSubmit={handleProfileSubmit}>
          <div className="form-group">
            <label htmlFor="profile-firstName">First name</label>
            <input
              id="profile-firstName"
              value={profileForm.firstName}
              onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
            />
            {profileError?.field === 'firstName' && (
              <p className="field-error">{profileError.message}</p>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="profile-lastName">Last name</label>
            <input
              id="profile-lastName"
              value={profileForm.lastName}
              onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
            />
            {profileError?.field === 'lastName' && (
              <p className="field-error">{profileError.message}</p>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="profile-phone">Phone</label>
            <input
              id="profile-phone"
              value={profileForm.phone}
              onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
            />
            {profileError?.field === 'phone' && <p className="field-error">{profileError.message}</p>}
          </div>
          <div className="form-group">
            <label htmlFor="profile-email">Email</label>
            <input id="profile-email" value={user.email} disabled />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={profileSaving}>
              {profileSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3 className="card-title">Google Calendar</h3>
        <p className="text-xs text-gray-400" style={{ marginBottom: 12 }}>
          Connect your Google account to get your task due dates and approved time off pushed to your personal
          Google Calendar, so Google's own reminders notify you.
        </p>
        {googleStatus?.connected ? (
          <>
            <p style={{ marginBottom: 12 }}>
              Connected as <strong>{googleStatus.googleAccountEmail}</strong>
              {googleStatus.needsReconnect && (
                <span className="field-error" style={{ display: 'block' }}>
                  Access was revoked — reconnect to resume syncing.
                </span>
              )}
            </p>
            <div className="form-actions">
              {googleStatus.needsReconnect && (
                <button type="button" className="btn-primary" onClick={handleGoogleConnect} disabled={googleBusy}>
                  Reconnect
                </button>
              )}
              <button type="button" onClick={handleGoogleDisconnect} disabled={googleBusy}>
                Disconnect
              </button>
            </div>
          </>
        ) : (
          <div className="form-actions">
            <button type="button" className="btn-primary" onClick={handleGoogleConnect} disabled={googleBusy}>
              {googleBusy ? 'Connecting…' : 'Connect Google Calendar'}
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">Change password</h3>
        <form onSubmit={handlePasswordSubmit}>
          <div className="form-group">
            <label htmlFor="profile-currentPassword">Current password</label>
            <PasswordInput
              id="profile-currentPassword"
              value={passwordForm.currentPassword}
              onChange={(value) => setPasswordForm({ ...passwordForm, currentPassword: value })}
              autoComplete="current-password"
            />
            {passwordError?.field === 'currentPassword' && (
              <p className="field-error">{passwordError.message}</p>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="profile-newPassword">New password</label>
            <PasswordInput
              id="profile-newPassword"
              value={passwordForm.newPassword}
              onChange={(value) => setPasswordForm({ ...passwordForm, newPassword: value })}
              autoComplete="new-password"
            />
            <PasswordChecklist password={passwordForm.newPassword} />
            {passwordError?.field === 'newPassword' && (
              <p className="field-error">{passwordError.message}</p>
            )}
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={passwordSaving}>
              {passwordSaving ? 'Saving…' : 'Update password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
