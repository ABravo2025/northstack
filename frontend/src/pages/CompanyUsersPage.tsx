import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useToast } from '../components/common/ToastProvider';
import ConfirmDialog from '../components/common/ConfirmDialog';
import Pagination, { paginate } from '../components/common/Pagination';
import SlideOver from '../components/common/SlideOver';
import RequiredMark from '../components/common/RequiredMark';
import { CheckIcon, CopyIcon, LockIcon, PlusIcon, SearchIcon, TrashIcon } from '../components/common/Icons';
import ColumnResizeHandle from '../components/entity-views/ColumnResizeHandle';
import HorizontalScrollbar from '../components/entity-views/HorizontalScrollbar';
import { useResizableColumns } from '../hooks/useResizableColumns';
import ColumnVisibilityMenu from '../components/entity-views/ColumnVisibilityMenu';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import { useColumnOrder } from '../hooks/useColumnOrder';
import Avatar, { getInitials } from '../components/common/Avatar';
import RoleChip from '../components/common/RoleChip';
import StatusChip from '../components/common/StatusChip';
import EntityCardList from '../components/common/EntityCardList';
import { usePermissions } from '../contexts/PermissionsContext';

const PAGE_SIZE = 20;
// Frozen columns stay pinned to the left through horizontal scroll and can't
// be dragged to reorder — everything else can.
const FROZEN_COLUMN_KEYS = ['name', 'status'];

interface CompanyUsersPageProps {
  user: any;
  token: string;
  onUserUpdated: (user: any) => void;
}

type SortField = 'name' | 'email' | 'phone' | 'role' | 'status';

const COLUMNS: { key: SortField; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'role', label: 'Role' },
  { key: 'status', label: 'Status' },
];

// Custom Roles Fase I — a genuinely custom role assignment leaves the legacy `role` enum at a
// 'member' placeholder (see tenantUserService.ts's roleId branch), so the real display name has
// to come from `roleRef.name` when present, falling back to the enum only for the rare case of a
// user/invitation with no roleId at all.
function displayRoleName(u: { role: string; roleRef?: { name: string } | null }): string {
  return u.roleRef?.name ?? u.role.charAt(0).toUpperCase() + u.role.slice(1);
}

// RoleChip only color-codes the 3 legacy tiers — a genuinely custom role rides the neutral
// "member" color with its real name as the label.
function roleChipProps(u: { role: string; roleRef?: { name: string } | null }): { role: 'owner' | 'admin' | 'member'; label?: string } {
  if (u.role === 'owner' || u.role === 'admin') return { role: u.role };
  const name = displayRoleName(u);
  return { role: 'member', label: name === 'Member' ? undefined : name };
}

function getSortValue(u: any, field: SortField): string {
  switch (field) {
    case 'name':
      return `${u.firstName} ${u.lastName}`.toLowerCase();
    case 'email':
      return u.email.toLowerCase();
    case 'phone':
      return u.phone.toLowerCase();
    case 'role':
      return displayRoleName(u).toLowerCase();
    case 'status':
      return u.status.toLowerCase();
  }
}

export default function CompanyUsersPage({ user, token, onUserUpdated }: CompanyUsersPageProps) {
  const toast = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  // Custom Roles Fase I — every assignable role in the tenant (seed + custom, Owner excluded),
  // replacing the old hardcoded member/admin options.
  const [assignableRoles, setAssignableRoles] = useState<{ id: string; name: string }[]>([]);
  const [pendingOwnerTransfer, setPendingOwnerTransfer] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  // `role` here holds a real roleId once assignableRoles has loaded (set once fetched, below) —
  // starts empty rather than a hardcoded 'member' guess, since the tenant may not even have a
  // role by that name anymore.
  const [inviteForm, setInviteForm] = useState({ email: '', role: '' });
  const [inviting, setInviting] = useState(false);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [draggedColKey, setDraggedColKey] = useState<string | null>(null);
  const [dragOverColKey, setDragOverColKey] = useState<string | null>(null);

  // Custom Roles Fase J — migrated off `user.role === 'owner'` to PermissionsContext's isOwner
  // (same underlying fact — literally the fixed Owner — read from the resolved RoleContext
  // instead of the legacy enum, which never diverges from it anyway).
  const isOwner = usePermissions().isOwner;
  const { getWidth: getColumnWidth, startResize } = useResizableColumns('northstack:columnWidths:companyUser');
  const { isHidden: isColumnHidden, toggle: toggleColumn } = useColumnVisibility('northstack:hiddenColumns:companyUser');
  const movableColumnKeys = COLUMNS.map((col) => col.key).filter((key) => !FROZEN_COLUMN_KEYS.includes(key));
  const { orderedKeys: columnOrder, reorder: reorderColumns } = useColumnOrder(
    'northstack:columnOrder:companyUser',
    movableColumnKeys,
  );
  const frozenColumns = FROZEN_COLUMN_KEYS.map((key) => COLUMNS.find((col) => col.key === key)).filter(
    (col): col is (typeof COLUMNS)[number] => !!col && !isColumnHidden(col.key),
  );
  const movableVisibleColumns = columnOrder
    .map((key) => COLUMNS.find((col) => col.key === key))
    .filter((col): col is (typeof COLUMNS)[number] => !!col && !isColumnHidden(col.key));
  const visibleColumns = [...frozenColumns, ...movableVisibleColumns];
  const getFrozenLeft = (key: string) => {
    let left = 0;
    for (const col of frozenColumns) {
      if (col.key === key) return left;
      left += getColumnWidth(col.key);
    }
    return left;
  };
  const { getWidth: getInviteColumnWidth, startResize: startInviteResize } = useResizableColumns(
    'northstack:columnWidths:companyUserInvite',
  );
  const tableWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadUsers();
    loadInvitations();
    loadAssignableRoles();
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

  const loadAssignableRoles = async () => {
    try {
      const data = await api.listAssignableRoles(token);
      setAssignableRoles(data);
      // Default the invite form to whichever role the tenant calls "Member" (the least-privileged
      // seed role) once it's known — same behavior as the old hardcoded default, just resolved
      // dynamically instead of assumed.
      setInviteForm((prev) => (prev.role ? prev : { ...prev, role: data.find((r) => r.name === 'Member')?.id ?? data[0]?.id ?? '' }));
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  // `value` is either the sentinel "owner" (the ownership-transfer flow, still enum-based — see
  // handleRoleChange) or a real roleId (Custom Roles Fase I) for any other role, seed or custom.
  const applyRoleChange = async (userId: string, value: string) => {
    try {
      if (value === 'owner') {
        await api.updateTenantUser(token, userId, { role: 'owner' });
        const { user: refreshedUser } = await api.getCurrentUser(token);
        onUserUpdated(refreshedUser);
      } else {
        await api.updateTenantUser(token, userId, { roleId: value });
      }
      loadUsers();
      toast.success('Role updated.');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleRoleChange = (userId: string, value: string) => {
    if (value === 'owner') {
      setPendingOwnerTransfer(userId);
      return;
    }
    applyRoleChange(userId, value);
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
      const { invitation } = await api.createTenantInvitation(token, { email: inviteForm.email, roleId: inviteForm.role });
      const link = `${window.location.origin}/accept-invite/${invitation.token}`;
      await navigator.clipboard.writeText(link);
      setInviteForm((prev) => ({ email: '', role: prev.role }));
      setInviteOpen(false);
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const searchFilteredUsers = users.filter((u) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)
    );
  });

  const sortedUsers = useMemo(() => {
    if (!sortField) return searchFilteredUsers;
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...searchFilteredUsers].sort((a, b) => {
      const av = getSortValue(a, sortField);
      const bv = getSortValue(b, sortField);
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
  }, [searchFilteredUsers, sortField, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(sortedUsers.length / PAGE_SIZE));
  const pagedUsers = paginate(sortedUsers, page, PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search]);

  return (
    <div>
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

      <SlideOver
        open={inviteOpen}
        title="Invite Someone"
        onClose={() => setInviteOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="invite-form" className="btn-primary" disabled={inviting}>
              {inviting ? 'Sending…' : 'Send invitation'}
            </button>
          </>
        }
      >
        <form id="invite-form" onSubmit={handleInvite}>
          <div className="form-group">
            <label htmlFor="invite-email">
              Email
              <RequiredMark />
            </label>
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
              {assignableRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </form>
      </SlideOver>

      <div className="page-toolbar">
        <h2>Users</h2>
        {users.length > 0 && (
          <div className="toolbar-search">
            <SearchIcon />
            <label htmlFor="user-search" className="sr-only">
              Search users
            </label>
            <input
              id="user-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
            />
          </div>
        )}
        <ColumnVisibilityMenu columns={COLUMNS} isHidden={isColumnHidden} onToggle={toggleColumn} />
        <button className="btn-primary" onClick={() => setInviteOpen(true)}>
          <span className="inline-flex items-center gap-1.5">
            <PlusIcon className="h-4 w-4" />
            Invite
          </span>
        </button>
      </div>

      {sortedUsers.length === 0 ? (
        <p className="mt-4">No users match your search.</p>
      ) : (
        <>
          <EntityCardList
            items={pagedUsers}
            getKey={(u) => u.id}
            getInitials={(u) => getInitials(u.firstName, u.lastName)}
            getName={(u) => `${u.firstName} ${u.lastName}`}
            getMeta={(u) => displayRoleName(u)}
            getStatusColor={(u) => (u.status === 'active' ? '#047857' : '#6b7280')}
          />
          <div className="full-table-wrap has-mobile-cards" ref={tableWrapRef}>
            <table className="table full-table">
              <colgroup>
                {visibleColumns.map((col) => (
                  <col key={col.key} style={{ width: getColumnWidth(col.key) }} />
                ))}
                <col style={{ width: 60 }} />
              </colgroup>
              <thead>
                <tr>
                  {visibleColumns.map((col) => {
                    const isFrozen = FROZEN_COLUMN_KEYS.includes(col.key);
                    const isLastFrozen = isFrozen && frozenColumns[frozenColumns.length - 1]?.key === col.key;
                    return (
                    <th
                      key={col.key}
                      draggable={!isFrozen}
                      onDragStart={isFrozen ? undefined : () => setDraggedColKey(col.key)}
                      onDragEnd={
                        isFrozen
                          ? undefined
                          : () => {
                              setDraggedColKey(null);
                              setDragOverColKey(null);
                            }
                      }
                      onDragOver={
                        isFrozen
                          ? undefined
                          : (e) => {
                              e.preventDefault();
                              if (dragOverColKey !== col.key) setDragOverColKey(col.key);
                            }
                      }
                      onDrop={
                        isFrozen
                          ? undefined
                          : () => {
                              if (draggedColKey) reorderColumns(draggedColKey, col.key);
                              setDraggedColKey(null);
                              setDragOverColKey(null);
                            }
                      }
                      className={`sortable ${sortField === col.key ? 'sorted' : ''} ${isFrozen ? 'col-frozen' : ''} ${isLastFrozen ? 'col-frozen-edge' : ''} ${!isFrozen && draggedColKey === col.key ? 'col-dragging' : ''} ${!isFrozen && dragOverColKey === col.key && draggedColKey && draggedColKey !== col.key ? 'col-drag-over' : ''}`}
                      style={isFrozen ? { left: getFrozenLeft(col.key), zIndex: 3 } : undefined}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      <span className="sort-arrow">
                        {sortField === col.key && sortDirection === 'desc' ? '▴' : '▾'}
                      </span>
                      <ColumnResizeHandle onMouseDown={(e) => startResize(col.key, e)} />
                    </th>
                    );
                  })}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pagedUsers.map((u) => {
                  const isSelf = u.id === user.id;
                  const canEditRole = !isSelf && (isOwner || u.role !== 'owner');
                  const cellByKey: Record<string, React.ReactNode> = {
                    name: (
                      <div className="name-cell">
                        <Avatar firstName={u.firstName} lastName={u.lastName} />
                        {u.firstName} {u.lastName}
                        {isSelf && ' (you)'}
                      </div>
                    ),
                    email: u.email,
                    phone: u.phone,
                    role: canEditRole ? (
                      <>
                        <label htmlFor={`role-${u.id}`} className="sr-only">
                          Role for {u.firstName} {u.lastName}
                        </label>
                        <select
                          id={`role-${u.id}`}
                          className="select-compact"
                          value={u.role === 'owner' ? 'owner' : (u.roleId ?? '')}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        >
                          {assignableRoles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                          {isOwner && <option value="owner">Owner (transfer ownership)</option>}
                        </select>
                      </>
                    ) : (
                      <RoleChip {...roleChipProps(u)} />
                    ),
                    status: (
                      <StatusChip
                        color={u.status === 'active' ? '#047857' : '#6b7280'}
                        label={u.status === 'active' ? 'Active' : 'Inactive'}
                      />
                    ),
                  };
                  return (
                    <tr key={u.id}>
                      {visibleColumns.map((col) => {
                        const isFrozen = FROZEN_COLUMN_KEYS.includes(col.key);
                        const isLastFrozen = isFrozen && frozenColumns[frozenColumns.length - 1]?.key === col.key;
                        return (
                          <td
                            key={col.key}
                            className={`${isFrozen ? 'col-frozen' : ''} ${isLastFrozen ? 'col-frozen-edge' : ''}`}
                            style={isFrozen ? { left: getFrozenLeft(col.key), zIndex: 1 } : undefined}
                          >
                            {cellByKey[col.key]}
                          </td>
                        );
                      })}
                      <td>
                        {canEditRole && (
                          <div className="icon-actions">
                            <button className="icon-btn" onClick={() => handleStatusToggle(u)}>
                              <span className="tip">{u.status === 'active' ? 'Deactivate' : 'Activate'}</span>
                              {u.status === 'active' ? <LockIcon /> : <CheckIcon />}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="ghost-row">
                  <td colSpan={visibleColumns.length + 1} className="ghost-row-cell" onClick={() => setInviteOpen(true)}>
                    <span className="ghost-row-inner">
                      <span className="ghost-plus-box">
                        <PlusIcon className="h-3 w-3" />
                      </span>
                      Invite
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <HorizontalScrollbar targetRef={tableWrapRef} />
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}

      {invitations.length > 0 && (
        <div className="mt-6">
          <h3 className="page-title">Pending invitations</h3>
          <div className="full-table-wrap mt-2">
            <table className="table full-table">
              <colgroup>
                <col style={{ width: getInviteColumnWidth('email') }} />
                <col style={{ width: getInviteColumnWidth('role') }} />
                <col style={{ width: getInviteColumnWidth('expires') }} />
                <col style={{ width: 70 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>
                    Email
                    <ColumnResizeHandle onMouseDown={(e) => startInviteResize('email', e)} />
                  </th>
                  <th>
                    Role
                    <ColumnResizeHandle onMouseDown={(e) => startInviteResize('role', e)} />
                  </th>
                  <th>
                    Expires
                    <ColumnResizeHandle onMouseDown={(e) => startInviteResize('expires', e)} />
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.email}</td>
                    <td>{displayRoleName(inv)}</td>
                    <td>{new Date(inv.expiresAt).toLocaleDateString()}</td>
                    <td>
                      <div className="icon-actions">
                        <button className="icon-btn" onClick={() => handleCopyLink(inv.token)}>
                          <span className="tip">Copy link</span>
                          <CopyIcon />
                        </button>
                        <button className="icon-btn danger" onClick={() => handleCancelInvitation(inv.id)}>
                          <span className="tip">Cancel</span>
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
