import { useRef, useState } from 'react';
import { api } from '../api';
import { useToast } from './ToastProvider';
import ColorPicker from './ColorPicker';
import Popover from './Popover';
import { DotsVerticalIcon } from './Icons';

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

  const handleMove = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;
    try {
      const current = sorted[index];
      const target = sorted[targetIndex];
      await api.updateStatusDefinition(token, current.id, { order: target.order });
      await api.updateStatusDefinition(token, target.id, { order: current.order });
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
            {sorted.map((status, index) => (
              <div className="status-manage-row" key={status.id}>
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
