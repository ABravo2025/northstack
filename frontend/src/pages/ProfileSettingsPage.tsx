import { useState } from 'react';
import { api } from '../api';

interface ProfileSettingsPageProps {
  user: any;
  token: string;
  onUserUpdated: (user: any) => void;
}

export default function ProfileSettingsPage({ user, token, onUserUpdated }: ProfileSettingsPageProps) {
  const [profileForm, setProfileForm] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
  });
  const [profileError, setProfileError] = useState<{ message: string; field?: string } | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [passwordError, setPasswordError] = useState<{ message: string; field?: string } | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);
    setProfileSaving(true);
    try {
      const result = await api.updateProfile(token, profileForm);
      onUserUpdated(result.user);
      setProfileSuccess('Profile updated');
    } catch (error) {
      setProfileError({
        message: (error as Error).message,
        field: (error as any).field,
      });
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);
    setPasswordSaving(true);
    try {
      await api.changePassword(token, passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '' });
      setPasswordSuccess('Password updated');
    } catch (error) {
      setPasswordError({
        message: (error as Error).message,
        field: (error as any).field,
      });
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <>
      <div className="card">
        <h3>Profile</h3>
        {profileError && !profileError.field && (
          <div className="alert alert-error">{profileError.message}</div>
        )}
        {profileSuccess && <div className="alert alert-success">{profileSuccess}</div>}
        <form onSubmit={handleProfileSubmit}>
          <div className="form-group">
            <label>First name</label>
            <input
              value={profileForm.firstName}
              onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
            />
            {profileError?.field === 'firstName' && (
              <p className="field-error">{profileError.message}</p>
            )}
          </div>
          <div className="form-group">
            <label>Last name</label>
            <input
              value={profileForm.lastName}
              onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
            />
            {profileError?.field === 'lastName' && (
              <p className="field-error">{profileError.message}</p>
            )}
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input
              value={profileForm.phone}
              onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
            />
            {profileError?.field === 'phone' && <p className="field-error">{profileError.message}</p>}
          </div>
          <div className="form-group">
            <label>Email</label>
            <input value={user.email} disabled />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={profileSaving}>
              {profileSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>Change password</h3>
        {passwordError && !passwordError.field && (
          <div className="alert alert-error">{passwordError.message}</div>
        )}
        {passwordSuccess && <div className="alert alert-success">{passwordSuccess}</div>}
        <form onSubmit={handlePasswordSubmit}>
          <div className="form-group">
            <label>Current password</label>
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
            />
            {passwordError?.field === 'currentPassword' && (
              <p className="field-error">{passwordError.message}</p>
            )}
          </div>
          <div className="form-group">
            <label>New password</label>
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
            />
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
    </>
  );
}
