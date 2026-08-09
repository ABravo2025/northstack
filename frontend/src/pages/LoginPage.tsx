import { useState } from 'react';
import PasswordInput from '../components/common/PasswordInput';
import AuthLayout from '../components/common/AuthLayout';
import RequiredMark from '../components/common/RequiredMark';

interface LoginPageProps {
  onLogin: (email: string, password: string) => void;
  onSwitchToRegister: () => void;
  onForgotPassword: () => void;
  loading: boolean;
}

export default function LoginPage({ onLogin, onSwitchToRegister, onForgotPassword, loading }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <AuthLayout>
      <h2 className="auth-title">Login</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="login-email">
            Email
            <RequiredMark />
          </label>
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
          <label htmlFor="login-password">
            Password
            <RequiredMark />
          </label>
          <PasswordInput
            id="login-password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            required
            disabled={loading}
            autoComplete="current-password"
          />
          <button type="button" className="auth-forgot-link" onClick={onForgotPassword}>
            Forgot your password?
          </button>
        </div>
        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
      <div className="auth-foot">
        <span>Don't have an account?</span>
        <button type="button" onClick={onSwitchToRegister}>
          Register
        </button>
      </div>
    </AuthLayout>
  );
}
