import { useState } from 'react';

interface CreateTenantPageProps {
  onCreateTenant: (data: {
    name: string;
    slug: string;
    ownerEmail: string;
    ownerPassword: string;
    ownerFirstName: string;
    ownerLastName: string;
  }) => void;
  onSwitchToLogin: () => void;
  loading: boolean;
}

export default function CreateTenantPage({
  onCreateTenant,
  onSwitchToLogin,
  loading,
}: CreateTenantPageProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [ownerFirstName, setOwnerFirstName] = useState('');
  const [ownerLastName, setOwnerLastName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateTenant({
      name,
      slug,
      ownerEmail,
      ownerPassword,
      ownerFirstName,
      ownerLastName,
    });
  };

  return (
    <div className="page">
      <div className="header">
        <h1>Northstack</h1>
      </div>
      <div className="container">
        <div className="card" style={{ maxWidth: '500px', margin: '40px auto' }}>
          <h2 className="text-center">Create New Tenant</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Tenant Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Company"
                required
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label>Tenant Slug</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="my-company"
                required
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label>Owner First Name</label>
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
              <label>Owner Last Name</label>
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
              <label>Owner Email</label>
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="owner@company.com"
                required
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label>Owner Password</label>
              <input
                type="password"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Creating...' : 'Create Tenant'}
              </button>
            </div>
          </form>
          <div className="mt-20 text-center">
            <p>
              <button className="btn btn-secondary" onClick={onSwitchToLogin}>
                Back to Login
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
