import { useRef, useState } from 'react';
import { api } from '../api';
import { useToast } from './ToastProvider';
import Popover from './Popover';
import { DotsVerticalIcon } from './Icons';

interface CatalogEntryLike {
  id: string;
  name: string;
  order: number;
  isActive: boolean;
}

interface FieldCatalogMenuProps {
  token: string;
  kind: 'department' | 'jobTitle';
  label: string;
  entries: CatalogEntryLike[];
  onChanged: () => void;
}

export default function FieldCatalogMenu({ token, kind, label, entries, onChanged }: FieldCatalogMenuProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);

  const sorted = [...entries].sort((a, b) => a.order - b.order);

  const handleToggleActive = async (entry: CatalogEntryLike) => {
    try {
      await api.updateFieldCatalogDefinition(token, entry.id, { isActive: !entry.isActive });
      onChanged();
    } catch (error) {
      toast.error(`Failed to update ${label.toLowerCase()}: ` + (error as Error).message);
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;
    try {
      const current = sorted[index];
      const target = sorted[targetIndex];
      await api.updateFieldCatalogDefinition(token, current.id, { order: target.order });
      await api.updateFieldCatalogDefinition(token, target.id, { order: current.order });
      onChanged();
    } catch (error) {
      toast.error(`Failed to reorder ${label.toLowerCase()} options: ` + (error as Error).message);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await api.createFieldCatalogDefinition(token, { kind, name: newName.trim(), order: sorted.length });
      setNewName('');
      toast.success(`${label} option added.`);
      onChanged();
    } catch (error) {
      toast.error(`Failed to add ${label.toLowerCase()} option: ` + (error as Error).message);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="col-menu-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={`Manage ${label.toLowerCase()} options`}
      >
        <DotsVerticalIcon />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} width={280}>
        <div onClick={(e) => e.stopPropagation()}>
          <div className="status-manage-list">
            {sorted.map((entry, index) => (
              <div className="status-manage-row" key={entry.id}>
                <div className="status-manage-reorder">
                  <button
                    type="button"
                    className="col-add-trigger"
                    disabled={index === 0}
                    onClick={() => handleMove(index, -1)}
                    aria-label="Move up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="col-add-trigger"
                    disabled={index === sorted.length - 1}
                    onClick={() => handleMove(index, 1)}
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                </div>
                <span className={`status-manage-name ${!entry.isActive ? 'inactive' : ''}`}>{entry.name}</span>
                <button type="button" className="status-manage-link" onClick={() => handleToggleActive(entry)}>
                  {entry.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            ))}
            {sorted.length === 0 && <p className="text-xs text-gray-500">No options yet.</p>}
          </div>
          <div className="nv-field mt-3">
            <label htmlFor={`catalog-new-${kind}`}>Add {label.toLowerCase()}</label>
            <input
              id={`catalog-new-${kind}`}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={kind === 'department' ? 'e.g. Engineering' : 'e.g. Account Executive'}
            />
          </div>
          <div className="nv-field">
            <button type="button" className="btn-primary w-full text-center" onClick={handleCreate}>
              Add
            </button>
          </div>
        </div>
      </Popover>
    </>
  );
}
