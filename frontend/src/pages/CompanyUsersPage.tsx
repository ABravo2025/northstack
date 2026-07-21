import { useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../components/ToastProvider';
import ConfirmDialog from '../components/ConfirmDialog';

interface CompanyUsersPageProps {
  user: any;
  token: string;
  onUserUpdated: (user: any) => void;
}

export default function CompanyUsersPage({ user, token, onUserUpdated }: CompanyUsersPageProps) {
  const toast = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [pendingOwnerTransfer, setPendingOwnerTransfer] = useState<string | null>(null);

  const [inviteForm, setInviteForm] = useState({ email: '', role: 'member' });
  const [inviting, setInviting] = useState(false);

  const isOwner = user.role === 'owner';

  useEffect(() => {
    loadUsers();
    loadInvitations();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await api.listTenantUsers(token);
      setUsers(data);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const loadInvitations = async () => {
    try {
      const data = await api.listTenantInvitations(token);
      setInvitations(data);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const applyRoleChange = async (userId: string, role: string) => {
    try {
      await api.updateTenantUser(token, userId, { role });
      loadUsers();
      if (role === 'owner') {
        const { user: refreshedUser } = await api.getCurrentUser(token);
        onUserUpdated(refreshedUser);
      }
      toast.success('Role updated.');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleRoleChange = (userId: string, role: string) => {
    if (role === 'owner') {
      setPendingOwnerTransfer(userId);
      return;
    }
    applyRoleChange(userId, role);
  };

  const handleStatusToggle = async (targetUser: any) => {
    const nextStatus = targetUser.status === 'active' ? 'inactive' : 'active';
    try {
      await api.updateTenantUser(token, targetUser.id, { status: nextStatus });
      toast.success(`${targetUser.firstName} ${targetUser.lastName} ${nextStatus === 'active' ? 'activated' : 'deactivated'}.`);
      loadUsers();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    try {
      const { invitation } = await api.createTenantInvitation(token, inviteForm);
      const link = `${window.location.origin}/accept-invite/${invitation.token}`;
      await navigator.clipboard.writeText(link);
      setInviteForm({ email: '', role: 'member' });
      toast.success('Invite sent and link copied to clipboard.');
      loadInvitations();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setInviting(false);
    }
  };

  const handleCopyLink = async (invitationToken: string) => {
    const link = `${window.location.origin}/accept-invite/${invitationToken}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Invite link copied to clipboard.');
    } catch (error) {
      toast.error('Failed to copy link: ' + (error as Error).message);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      await api.cancelInvitation(token, invitationId);
      toast.success('Invitation cancelled.');
      loadInvitations();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <>
      {pendingOwnerTransfer && (
        <ConfirmDialog
          title="Transfer ownership"
          message="This transfers ownership to this user — you will be moved to admin. Continue?"
          confirmLabel="Transfer"
          onConfirm={() => {
            const userId = pendingOwnerTransfer;
            setPendingOwnerTransfer(null);
            applyRoleChange(userId, 'owner');
          }}
          onCancel={() => setPendingOwnerTransfer(null)}
        />
      )}
      <div className="card">
        <h3>Users</h3>

        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === user.id;
              const canEditRole = !isSelf && (isOwner || u.role !== 'owner');
              return (
                <tr key={u.id}>
                  <td>
                    {u.firstName} {u.lastName}
                    {isSelf && ' (you)'}
                  </td>
                  <td>{u.email}</td>
                  <td>{u.phone}</td>
                  <td>
                    {canEditRole ? (
                      <>
                        <label htmlFor={`role-${u.id}`} className="sr-only">
                          Role for {u.firstName} {u.lastName}
                        </label>
                        <select
                          id={`role-${u.id}`}
                          className="select-compact"
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        >
                          <option value="member">member</option>
                          <option value="admin">admin</option>
                          {isOwner && <option value="owner">owner</option>}
                        </select>
                      </>
                    ) : (
                      u.role
                    )}
                  </td>
                  <td>{u.status}</td>
                  <td>
                    {canEditRole && (
                      <button className="btn-secondary" onClick={() => handleStatusToggle(u)}>
                        {u.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {invitations.length > 0 && (
          <>
            <h3 className="mt-5">Pending invitations</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Expires</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.email}</td>
                    <td>{inv.role}</td>
                    <td>{new Date(inv.expiresAt).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="btn-secondary px-2 py-1 text-xs mr-1.5"
                        onClick={() => handleCopyLink(inv.token)}
                      >
                        Copy Link
                      </button>
                      <button
                        className="btn-danger px-2 py-1 text-xs"
                        onClick={() => handleCancelInvitation(inv.id)}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card">
        <h3>Invite someone</h3>
        <form onSubmit={handleInvite}>
          <div className="form-group">
            <label htmlFor="invite-email">Email</label>
            <input
              id="invite-email"
              type="email"
              value={inviteForm.email}
              onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="invite-role">Role</label>
            <select
              id="invite-role"
              value={inviteForm.role}
              onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={inviting}>
              {inviting ? 'Sending…' : 'Send invitation'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
