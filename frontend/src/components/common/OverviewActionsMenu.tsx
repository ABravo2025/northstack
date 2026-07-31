import { useRef, useState } from 'react';
import Popover from './Popover';

interface ActionItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface OverviewActionsMenuProps {
  items: ActionItem[];
  className?: string;
}

// "Actions" trigger for a detail modal header (Tarea 5, tareas-ux-ui.md) —
// surfaces destructive/administrative actions (Delete, Invite to app) that
// otherwise only live in the table row, so they're reachable from inside the
// detail view too.
export default function OverviewActionsMenu({ items, className = '' }: OverviewActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  if (items.length === 0) return null;

  return (
    <div className={`popover-anchor ${className}`}>
      <button type="button" ref={anchorRef} className="btn-secondary btn-sm" onClick={() => setOpen((v) => !v)}>
        Actions
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} width={180}>
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`popover-menu-item w-full text-left ${item.danger ? 'danger' : ''}`}
            onClick={() => {
              setOpen(false);
              item.onClick();
            }}
          >
            {item.label}
          </button>
        ))}
      </Popover>
    </div>
  );
}
