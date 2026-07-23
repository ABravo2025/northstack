import { useRef, useState } from 'react';
import { api } from '../api';
import { useToast } from './ToastProvider';
import ColorPicker from './ColorPicker';
import Popover from './Popover';
import { DotsVerticalIcon, GripIcon } from './Icons';

interface StatusLike {
  id: string;
  name: string;
  color: string | null;
  order: number;
  isDefault: boolean;
  isActive: boolean;
}

interface StatusColumnMenuProps {
  token: string;
  entityType: 'employee' | 'client';
  statuses: StatusLike[];
  onChanged: () => void;
  onHide?: () => void;
}

export default function StatusColumnMenu({ token, entityType, statuses, onChanged, onHide }: StatusColumnMenuProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3c6da1');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const sorted = [...statuses].sort((a, b) => a.order - b.order);

  const handleToggleActive = async (status: StatusLike) => {
    try {
      await api.updateStatusDefinition(token, status.id, { isActive: !status.isActive });
      onChanged();
    } catch (error) {
      toast.error('Failed to update status: ' + (error as Error).message);
    }
  };

  const handleSetDefault = async (status: StatusLike) => {
    try {
      await api.updateStatusDefinition(token, status.id, { isDefault: true });
      onChanged();
    } catch (error) {
      toast.error('Failed to update status: ' + (error as Error).message);
    }
  };

  const handleColorChange = async (status: StatusLike, color: string) => {
    try {
      await api.updateStatusDefinition(token, status.id, { color });
      onChanged();
    } catch (error) {
      toast.error('Failed to update status color: ' + (error as Error).message);
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
          await api.updateStatusDefinition(token, reordered[i].id, { order: i });
        }
      }
      onChanged();
    } catch (error) {
      toast.error('Failed to reorder statuses: ' + (error as Error).message);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await api.createStatusDefinition(token, {
        entityType,
        name: newName.trim(),
        color: newColor,
        order: sorted.length,
      });
      setNewName('');
      setNewColor('#3c6da1');
      toast.success('Status added.');
      onChanged();
    } catch (error) {
      toast.error('Failed to create status: ' + (error as Error).message);
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
        aria-label="Manage status options"
      >
        <DotsVerticalIcon />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} width={320}>
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
            {sorted.map((status) => (
              <div
                className={`status-manage-row ${draggedId === status.id ? 'dragging' : ''} ${dragOverId === status.id && draggedId && draggedId !== status.id ? 'drag-over' : ''}`}
                key={status.id}
                onDragOver={(e) => handleDragOver(e, status.id)}
                onDrop={() => handleDrop(status.id)}
              >
                <span
                  className="status-manage-grip"
                  draggable
                  onDragStart={() => handleDragStart(status.id)}
                  onDragEnd={handleDragEnd}
                  aria-label={`Drag to reorder ${status.name}`}
                >
                  <GripIcon className="h-3.5 w-3.5" />
                </span>
                <ColorPicker value={status.color || '#9ca3af'} onChange={(color) => handleColorChange(status, color)} />
                <span className={`status-manage-name ${!status.isActive ? 'inactive' : ''}`}>{status.name}</span>
                {status.isDefault ? (
                  <span className="chip-linked">Default</span>
                ) : (
                  <button type="button" className="status-manage-link" onClick={() => handleSetDefault(status)}>
                    Set default
                  </button>
                )}
                <button type="button" className="status-manage-link" onClick={() => handleToggleActive(status)}>
                  {status.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            ))}
          </div>
          <div className="nv-field mt-3">
            <label htmlFor="status-new-name">Add status</label>
            <input
              id="status-new-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. On Leave"
            />
          </div>
          <div className="nv-field flex items-center gap-2">
            <ColorPicker value={newColor} onChange={setNewColor} />
            <button type="button" className="btn-primary flex-1 text-center" onClick={handleCreate}>
              Add
            </button>
          </div>
        </div>
      </Popover>
    </>
  );
}
