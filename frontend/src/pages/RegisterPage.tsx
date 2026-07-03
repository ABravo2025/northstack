import { useState } from 'react';

interface RegisterPageProps {
  onRegister: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    tenantId?: string;
    tenantName?: string;
    tenantSlug?: string;
  }) => void;
  onSwitchToLogin: () => void;
  loading: boolean;
}

export default function RegisterPage({
  onRegister,
  onSwitchToLogin,
  loading,
}: RegisterPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRegister({
      email,
      password,
      firstName,
      lastName,
      tenantId: tenantId || undefined,
      tenantName: tenantName || undefined,
      tenantSlug: tenantSlug || undefined,
    });
  };

  return (
    <div className="page">
      <div className="header">
        <h1>Northstack</h1>
      </div>
      <div className="container">
        <div className="card" style={{ maxWidth: '400px', margin: '40px auto' }}>
          <h2 className="text-center">Register</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
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
                placeholder="Doe"
                required
                disabled={loading}
              />
            </div>
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
            <div className="form-group">
              <label>Tenant ID (optional)</label>
              <input
                type="text"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="Optional: join an existing tenant"
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label>New Tenant Name (optional)</label>
              <input
                type="text"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="Create a new tenant workspace"
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label>New Tenant Slug (optional)</label>
              <input
                type="text"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                placeholder="Optional: my-company"
                disabled={loading}
              />
            </div>
            <div className="form-group" style={{ fontSize: '13px', color: '#475569' }}>
              <p>
                Provide either a Tenant ID to join an existing tenant or a Tenant Name to create a new tenant and owner account.
              </p>
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
