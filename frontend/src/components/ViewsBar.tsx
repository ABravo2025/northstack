import { useEffect, useRef, useState } from 'react';
import type { SavedView } from '../api';
import type { ViewField } from '../lib/viewFields';
import ConfirmDialog from './ConfirmDialog';
import { DotsVerticalIcon, GridIcon, KanbanIcon, LockIcon, PlusIcon, TeamIcon } from './Icons';

interface NewViewInput {
  name: string;
  type: 'grid' | 'kanban';
  visibility: 'personal' | 'shared';
  groupByField?: string;
}

interface ViewsBarProps {
  allLabel: string;
  views: SavedView[];
  activeViewId: string | null;
  onSelectView: (viewId: string | null) => void;
  canCreateShared: boolean;
  canDeleteShared: (view: SavedView) => boolean;
  groupableFields: ViewField[];
  onCreateView: (input: NewViewInput) => Promise<void>;
  onRenameView: (id: string, name: string) => Promise<void>;
  onDuplicateView: (view: SavedView) => Promise<void>;
  onDeleteView: (id: string) => Promise<void>;
}

export default function ViewsBar({
  allLabel,
  views,
  activeViewId,
  onSelectView,
  canCreateShared,
  canDeleteShared,
  groupableFields,
  onCreateView,
  onRenameView,
  onDuplicateView,
  onDeleteView,
}: ViewsBarProps) {
  const [newViewOpen, setNewViewOpen] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingView, setDeletingView] = useState<SavedView | null>(null);

  const [nvName, setNvName] = useState('');
  const [nvType, setNvType] = useState<'grid' | 'kanban'>('grid');
  const [nvVisibility, setNvVisibility] = useState<'personal' | 'shared'>('personal');
  const [nvGroupBy, setNvGroupBy] = useState(groupableFields[0]?.key ?? '');

  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!newViewOpen && !menuOpenFor) return;
    const handleClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setNewViewOpen(false);
        setMenuOpenFor(null);
        setRenamingId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [newViewOpen, menuOpenFor]);

  const resetNewViewForm = () => {
    setNvName('');
    setNvType('grid');
    setNvVisibility('personal');
    setNvGroupBy(groupableFields[0]?.key ?? '');
  };

  const handleCreate = async () => {
    if (!nvName.trim()) return;
    if (nvType === 'kanban' && !nvGroupBy) return;
    await onCreateView({
      name: nvName.trim(),
      type: nvType,
      visibility: nvVisibility,
      groupByField: nvType === 'kanban' ? nvGroupBy : undefined,
    });
    setNewViewOpen(false);
    resetNewViewForm();
  };

  const startRename = (view: SavedView) => {
    setRenamingId(view.id);
    setRenameValue(view.name);
    setMenuOpenFor(null);
  };

  const submitRename = async (id: string) => {
    if (renameValue.trim()) {
      await onRenameView(id, renameValue.trim());
    }
    setRenamingId(null);
  };

  return (
    <div className="views-bar" ref={barRef}>
      {deletingView && (
        <ConfirmDialog
          title="Delete view"
          message={`Delete "${deletingView.name}"? This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={async () => {
            await onDeleteView(deletingView.id);
            setDeletingView(null);
          }}
          onCancel={() => setDeletingView(null)}
        />
      )}

      <button type="button" className={`view-tab ${activeViewId === null ? 'active' : ''}`} onClick={() => onSelectView(null)}>
        <GridIcon />
        {allLabel}
      </button>

      {views.map((view) => {
        const isRenaming = renamingId === view.id;
        const canDelete = canDeleteShared(view);
        return (
          <div key={view.id} className="popover-anchor">
            {isRenaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => submitRename(view.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename(view.id);
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                className="rounded-md border border-brand-blue px-2 py-1 text-sm"
                style={{ width: 140 }}
              />
            ) : (
              <button
                type="button"
                className={`view-tab ${activeViewId === view.id ? 'active' : ''}`}
                onClick={() => onSelectView(view.id)}
              >
                {view.visibility === 'personal' ? <LockIcon /> : <TeamIcon />}
                {view.name}
                <span
                  className="view-tab-menu"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenFor(menuOpenFor === view.id ? null : view.id);
                  }}
                >
                  <DotsVerticalIcon />
                </span>
              </button>
            )}
            {menuOpenFor === view.id && (
              <div className="popover-panel" style={{ minWidth: 140 }}>
                <div className="popover-menu-item" onClick={() => startRename(view)}>
                  Rename
                </div>
                <div
                  className="popover-menu-item"
                  onClick={() => {
                    setMenuOpenFor(null);
                    onDuplicateView(view);
                  }}
                >
                  Duplicate
                </div>
                <div
                  className={`popover-menu-item ${canDelete ? 'danger' : 'disabled'}`}
                  title={canDelete ? undefined : 'Only the creator or the tenant owner can delete this view'}
                  onClick={() => {
                    if (!canDelete) return;
                    setMenuOpenFor(null);
                    setDeletingView(view);
                  }}
                >
                  Delete
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="popover-anchor">
        <button
          type="button"
          className="view-tab-add"
          aria-label="New view"
          onClick={() => {
            setNewViewOpen((v) => !v);
            resetNewViewForm();
          }}
        >
          <PlusIcon />
        </button>
        {newViewOpen && (
          <div className="popover-panel" style={{ width: 260 }}>
            <div className="nv-field">
              <label htmlFor="nv-name">View name</label>
              <input
                id="nv-name"
                type="text"
                value={nvName}
                onChange={(e) => setNvName(e.target.value)}
                placeholder="e.g. Sales team only"
                autoFocus
              />
            </div>
            <div className="nv-field">
              <label>Type</label>
              <div className="toggle-row">
                <div className={`toggle-opt ${nvType === 'grid' ? 'active' : ''}`} onClick={() => setNvType('grid')}>
                  <GridIcon />
                  Grid
                </div>
                <div
                  className={`toggle-opt ${nvType === 'kanban' ? 'active' : ''}`}
                  onClick={() => setNvType('kanban')}
                >
                  <KanbanIcon />
                  Kanban
                </div>
              </div>
            </div>
            {nvType === 'kanban' && (
              <div className="nv-field">
                <label htmlFor="nv-groupby">Group by (select fields only)</label>
                <select id="nv-groupby" value={nvGroupBy} onChange={(e) => setNvGroupBy(e.target.value)}>
                  {groupableFields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="nv-field">
              <label>Visibility</label>
              <div className="toggle-row">
                <div
                  className={`toggle-opt ${nvVisibility === 'personal' ? 'active' : ''}`}
                  onClick={() => setNvVisibility('personal')}
                >
                  <LockIcon />
                  Only me
                </div>
                {canCreateShared && (
                  <div
                    className={`toggle-opt ${nvVisibility === 'shared' ? 'active' : ''}`}
                    onClick={() => setNvVisibility('shared')}
                  >
                    <TeamIcon />
                    Whole team
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              className="btn-primary w-full text-center"
              style={{ marginTop: 4 }}
              onClick={handleCreate}
            >
              Create view
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
