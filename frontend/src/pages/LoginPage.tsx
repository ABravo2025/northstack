import { useState } from 'react';

interface LoginPageProps {
  onLogin: (email: string, password: string) => void;
  onSwitchToRegister: () => void;
  loading: boolean;
}

export default function LoginPage({ onLogin, onSwitchToRegister, loading }: LoginPageProps) {
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
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
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
              <button className="btn btn-secondary ml-1" onClick={onSwitchToRegister}>
                Register
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
