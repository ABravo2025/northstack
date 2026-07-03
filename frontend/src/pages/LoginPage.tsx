import { useState } from 'react';

interface LoginPageProps {
  onLogin: (email: string, password: string) => void;
  onSwitchToRegister: () => void;
  loading: boolean;
}

export default function LoginPage({
  onLogin,
  onSwitchToRegister,
  loading,
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
        <h1>Northstack</h1>
      </div>
      <div className="container">
        <div className="card" style={{ maxWidth: '400px', margin: '40px auto' }}>
          <h2 className="text-center">Login</h2>
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
                className="btn btn-secondary"
                onClick={onSwitchToRegister}
                style={{ marginLeft: '5px' }}
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
