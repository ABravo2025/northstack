import { useState } from 'react';
import type { FormError } from '../App';

interface RegisterPageProps {
  onRegister: (data: {
    tenantName: string;
    ownerFirstName: string;
    ownerLastName: string;
    ownerEmail: string;
    ownerPassword: string;
    ownerPhone: string;
  }) => void;
  onSwitchToLogin: () => void;
  loading: boolean;
  error?: FormError | null;
}

const KNOWN_FIELDS = ['tenantName', 'ownerEmail', 'ownerPhone', 'ownerPassword'];

export default function RegisterPage({
  onRegister,
  onSwitchToLogin,
  loading,
  error,
}: RegisterPageProps) {
  const [tenantName, setTenantName] = useState('');
  const [ownerFirstName, setOwnerFirstName] = useState('');
  const [ownerLastName, setOwnerLastName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');

  const fieldError = (name: string) => (error?.field === name ? error.message : null);
  const generalError = error && !KNOWN_FIELDS.includes(error.field ?? '') ? error.message : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRegister({
      tenantName,
      ownerFirstName,
      ownerLastName,
      ownerEmail,
      ownerPassword,
      ownerPhone,
    });
  };

  return (
    <div className="page">
      <div className="header">
        <h1>Northstack</h1>
      </div>
      <div className="container">
        <div className="card" style={{ maxWidth: '400px', margin: '40px auto' }}>
          <h2 className="text-center">Register your company</h2>
          {generalError && <div className="alert alert-error">{generalError}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Company Name</label>
              <input
                type="text"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="My Company"
                required
                disabled={loading}
              />
              {fieldError('tenantName') && (
                <div className="field-error">{fieldError('tenantName')}</div>
              )}
            </div>
            <div className="form-group">
              <label>First Name</label>
              <input
                type="text"
                value={ownerFirstName}
                onChange={(e) => setOwnerFirstName(e.target.value)}
                placeholder="John"
                required
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input
                type="text"
                value={ownerLastName}
                onChange={(e) => setOwnerLastName(e.target.value)}
                placeholder="Doe"
                required
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={loading}
              />
              {fieldError('ownerEmail') && (
                <div className="field-error">{fieldError('ownerEmail')}</div>
              )}
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input
                type="tel"
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(e.target.value)}
                placeholder="+1 555 0100"
                required
                disabled={loading}
              />
              {fieldError('ownerPhone') && (
                <div className="field-error">{fieldError('ownerPhone')}</div>
              )}
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
              />
              {fieldError('ownerPassword') && (
                <div className="field-error">{fieldError('ownerPassword')}</div>
              )}
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Registering...' : 'Register'}
              </button>
            </div>
          </form>
          <div className="mt-20 text-center">
            <p>
              Already have an account?{' '}
              <button
                className="btn btn-secondary"
                onClick={onSwitchToLogin}
                style={{ marginLeft: '5px' }}
              >
                Login
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
