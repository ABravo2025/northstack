import { useRef, useState } from 'react';
import { api } from '../api';
import { useToast } from './ToastProvider';
import Popover from './Popover';
import { DotsVerticalIcon, GripIcon } from './Icons';

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
  onHide?: () => void;
}

export default function FieldCatalogMenu({ token, kind, label, entries, onChanged, onHide }: FieldCatalogMenuProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
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

  const handleDragStart = (id: string) => setDraggedId(id);
  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };
  const handleDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    if (dragOverId !== overId) setDragOverId(overId);
  };

  const handleDrop = async (targetId: string) => {
    setDragOverId(null);
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    const draggedIndex = sorted.findIndex((s) => s.id === draggedId);
    const targetIndex = sorted.findIndex((s) => s.id === targetId);
    setDraggedId(null);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const reordered = [...sorted];
    const [moved] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    try {
      for (let i = 0; i < reordered.length; i++) {
        if (reordered[i].order !== i) {
          await api.updateFieldCatalogDefinition(token, reordered[i].id, { order: i });
        }
      }
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
          {onHide && (
            <div
              className="popover-menu-item"
              onClick={() => {
                setOpen(false);
                onHide();
              }}
            >
              Hide column
            </div>
          )}
          <div className="status-manage-list">
            {sorted.map((entry) => (
              <div
                className={`status-manage-row ${draggedId === entry.id ? 'dragging' : ''} ${dragOverId === entry.id && draggedId && draggedId !== entry.id ? 'drag-over' : ''}`}
                key={entry.id}
                onDragOver={(e) => handleDragOver(e, entry.id)}
                onDrop={() => handleDrop(entry.id)}
              >
                <span
                  className="status-manage-grip"
                  draggable
                  onDragStart={() => handleDragStart(entry.id)}
                  onDragEnd={handleDragEnd}
                  aria-label={`Drag to reorder ${entry.name}`}
                >
                  <GripIcon className="h-3.5 w-3.5" />
                </span>
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
