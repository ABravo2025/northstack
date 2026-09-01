import { useRef, useState } from 'react';
import ConfirmDialog from '../common/ConfirmDialog';
import Popover from '../common/Popover';
import { DotsVerticalIcon } from '../common/Icons';
import type { Role } from '../../api';

interface RoleColumnMenuProps {
  role: Role;
  onRename: (roleId: string, name: string) => Promise<void>;
  onDelete: (roleId: string) => Promise<void>;
}

// Same pattern as CustomFieldColumnMenu.tsx (Popover + inline edit + ConfirmDialog for the
// destructive action) — a role's column header is conceptually the same "manage this thing from
// its own header" interaction as a custom-field column, just for a Role instead of a
// CustomFieldDefinition.
export default function RoleColumnMenu({ role, onRename, onDelete }: RoleColumnMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(role.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const openMenu = () => {
    setRenaming(false);
    setName(role.name);
    setMenuOpen(true);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === role.name) {
      setMenuOpen(false);
      return;
    }
    setSaving(true);
    try {
      await onRename(role.id, trimmed);
      setMenuOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {confirmingDelete && (
        <ConfirmDialog
          title="Delete role"
          message={`Delete "${role.name}"? This can't be undone. Anyone still assigned to this role (or with a pending invitation to it) needs to be moved to a different role first.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await onDelete(role.id);
            setConfirmingDelete(false);
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
      <button
        ref={triggerRef}
        type="button"
        className="col-menu-trigger"
        onClick={(e) => {
          e.stopPropagation();
          openMenu();
        }}
        aria-label={`Manage the ${role.name} role`}
      >
        <DotsVerticalIcon />
      </button>
      <Popover open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={triggerRef} width={renaming ? 220 : 150}>
        {!renaming ? (
          <>
            <div className="popover-menu-item" onClick={() => setRenaming(true)}>
              Rename role
            </div>
            <div
              className="popover-menu-item danger"
              onClick={() => {
                setMenuOpen(false);
                setConfirmingDelete(true);
              }}
            >
              Delete role
            </div>
          </>
        ) : (
          <div onClick={(e) => e.stopPropagation()}>
            <div className="nv-field">
              <label htmlFor={`role-rename-${role.id}`}>Role name</label>
              <input
                id={`role-rename-${role.id}`}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                autoFocus
              />
            </div>
            <button type="button" className="btn-primary w-full text-center" disabled={saving} onClick={handleSave}>
              Save
            </button>
          </div>
        )}
      </Popover>
    </>
  );
}
