import { useState } from 'react';
import { api } from '../api';

interface AcceptInvitePageProps {
  invitationToken: string;
  onAccepted: (token: string, user: any) => void;
}

type Mode = 'login' | 'register';

export default function AcceptInvitePage({ invitationToken, onAccepted }: AcceptInvitePageProps) {
  const [mode, setMode] = useState<Mode>('register');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  const acceptWithSessionToken = async (sessionToken: string) => {
    const result = await api.acceptInvitation(sessionToken, invitationToken);
    onAccepted(sessionToken, result.user);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response =
        mode === 'login'
          ? await api.login({ email, password })
          : await api.register({ firstName, lastName, email, password, phone });

      const sessionToken = response.session?.token;
      if (!sessionToken) {
        throw new Error('Could not start a session');
      }

      await acceptWithSessionToken(sessionToken);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="header">
        <h1>Northstack</h1>
      </div>
      <div className="container">
        <div className="card" style={{ maxWidth: '400px', margin: '40px auto' }}>
          <h2 className="text-center">You've been invited</h2>
          <p className="text-center">
            {mode === 'register'
              ? 'Create your account to join your team.'
              : 'Log in to accept the invitation.'}
          </p>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            {mode === 'register' && (
              <>
                <div className="form-group">
                  <label>First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="form-group">
                  <label>Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input
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
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Please wait...' : mode === 'register' ? 'Create account & accept' : 'Log in & accept'}
              </button>
            </div>
          </form>
          <div className="mt-20 text-center">
            <p>
              {mode === 'register' ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setError(null);
                  setMode(mode === 'register' ? 'login' : 'register');
                }}
                style={{ marginLeft: '5px' }}
              >
                {mode === 'register' ? 'Login' : 'Register'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
