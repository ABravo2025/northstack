import { useState } from 'react';
import type { FormError } from '../App';

interface LoginPageProps {
  onLogin: (email: string, password: string) => void;
  onSwitchToRegister: () => void;
  loading: boolean;
  error?: FormError | null;
}

export default function LoginPage({
  onLogin,
  onSwitchToRegister,
  loading,
  error,
}: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <div className="page">
      <div className="header">
        <img src="/logo-horizontal-light.svg" alt="Northstack" />
      </div>
      <div className="container">
        <div className="card mx-auto mt-10 max-w-md">
          <h2 className="text-center">Login</h2>
          {error && <div className="alert alert-error">{error.message}</div>}
          <form onSubmit={handleSubmit}>
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
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </div>
          </form>
          <div className="mt-20 text-center">
            <p>
              Don't have an account?{' '}
              <button
                className="btn btn-secondary ml-1"
                onClick={onSwitchToRegister}
              >
                Register
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
