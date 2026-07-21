import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useToast } from '../components/ToastProvider';
import PasswordInput from '../components/PasswordInput';
import PasswordChecklist from '../components/PasswordChecklist';
import LegalDocumentModal from '../components/LegalDocumentModal';

interface AcceptInvitePageProps {
  onAccepted: (token: string, user: any) => void;
}

type Mode = 'login' | 'register';

export default function AcceptInvitePage({ onAccepted }: AcceptInvitePageProps) {
  const toast = useToast();
  const { token: invitationToken } = useParams<{ token: string }>();
  const [mode, setMode] = useState<Mode>('register');
  const [loading, setLoading] = useState(false);

  const [invitationLoading, setInvitationLoading] = useState(true);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [invitationRole, setInvitationRole] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [legalDoc, setLegalDoc] = useState<'terms' | 'privacy' | null>(null);

  useEffect(() => {
    if (!invitationToken) {
      setInvitationError('Missing invitation token');
      setInvitationLoading(false);
      return;
    }

    api
      .getInvitation(invitationToken)
      .then((invitation) => {
        if (invitation.status !== 'pending' || new Date(invitation.expiresAt) < new Date()) {
          setInvitationError('This invitation is no longer valid.');
          return;
        }
        setEmail(invitation.email);
        setInvitationRole(invitation.role);
      })
      .catch((err) => setInvitationError((err as Error).message))
      .finally(() => setInvitationLoading(false));
  }, [invitationToken]);

  const acceptWithSessionToken = async (sessionToken: string) => {
    if (!invitationToken) {
      throw new Error('Missing invitation token');
    }
    const result = await api.acceptInvitation(sessionToken, invitationToken);
    onAccepted(sessionToken, result.user);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response =
        mode === 'login'
          ? await api.login({ email, password })
          : await api.register({ firstName, lastName, email, password, phone, acceptedTerms });

      const sessionToken = response.session?.token;
      if (!sessionToken) {
        throw new Error('Could not start a session');
      }

      await acceptWithSessionToken(sessionToken);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="header">
        <img src="/logo-horizontal-light.svg" alt="Northstack" />
      </div>
      <div className="container">
        <div className="card mx-auto mt-10 max-w-md">
          <h2 className="text-center">You've been invited</h2>

          {invitationLoading ? (
            <p className="text-center">Loading invitation…</p>
          ) : invitationError ? (
            <div className="alert alert-error">{invitationError}</div>
          ) : (
            <>
              <p className="text-center">
                {mode === 'register'
                  ? `Create your account to join your team${invitationRole ? ` as ${invitationRole}` : ''}.`
                  : 'Log in to accept the invitation.'}
              </p>
              <form onSubmit={handleSubmit}>
                {mode === 'register' && (
                  <>
                    <div className="form-group">
                      <label htmlFor="invite-firstName">First Name</label>
                      <input
                        id="invite-firstName"
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        required
                        disabled={loading}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="invite-lastName">Last Name</label>
                      <input
                        id="invite-lastName"
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        required
                        disabled={loading}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="invite-phone">Phone</label>
                      <input
                        id="invite-phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+1 555 0100"
                        required
                        disabled={loading}
                      />
                    </div>
                  </>
                )}
                <div className="form-group">
                  <label htmlFor="invite-email">Email</label>
                  <input id="invite-email" type="email" value={email} disabled />
                </div>
                <div className="form-group">
                  <label htmlFor="invite-password">Password</label>
                  <PasswordInput
                    id="invite-password"
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••"
                    required
                    disabled={loading}
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  />
                  {mode === 'register' && <PasswordChecklist password={password} />}
                </div>
                {mode === 'register' && (
                  <div className="form-group">
                    <label className="flex items-start gap-1.5 text-sm font-normal">
                      <input
                        type="checkbox"
                        className="mt-0.5 w-auto"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                        required
                        disabled={loading}
                      />
                      <span>
                        I agree to the{' '}
                        <button
                          type="button"
                          className="text-brand-blue underline underline-offset-2 hover:text-brand-navy dark:hover:text-brand-blue-light"
                          onClick={() => setLegalDoc('terms')}
                        >
                          Terms of Service
                        </button>{' '}
                        and{' '}
                        <button
                          type="button"
                          className="text-brand-blue underline underline-offset-2 hover:text-brand-navy dark:hover:text-brand-blue-light"
                          onClick={() => setLegalDoc('privacy')}
                        >
                          Privacy Policy
                        </button>
                      </span>
                    </label>
                  </div>
                )}
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading
                      ? 'Please wait...'
                      : mode === 'register'
                        ? 'Create account & accept'
                        : 'Log in & accept'}
                  </button>
                </div>
              </form>
              <div className="mt-20 text-center">
                <p>
                  {mode === 'register' ? 'Already have an account?' : "Don't have an account?"}{' '}
                  <button
                    className="btn btn-secondary ml-1"
                    onClick={() => setMode(mode === 'register' ? 'login' : 'register')}
                  >
                    {mode === 'register' ? 'Login' : 'Register'}
                  </button>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      {legalDoc && <LegalDocumentModal initialDoc={legalDoc} onClose={() => setLegalDoc(null)} />}
    </div>
  );
}
