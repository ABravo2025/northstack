import { useState } from 'react';
import { api } from '../api';
import { useToast } from '../components/ToastProvider';
import PasswordInput from '../components/PasswordInput';
import PasswordChecklist from '../components/PasswordChecklist';

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
