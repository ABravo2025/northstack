import { usePrimaryActionValue } from '../../contexts/PrimaryActionContext';
import { PlusIcon } from '../common/Icons';

// Mobile-only floating action button for the current page's primary "Add X" action — spec'd
// alongside the bottom tabbar (tareas-ux-ui.md Tarea 9c: 52x52, right:16px, bottom:76px so it
// clears the tabbar) but never built until now. Renders nothing on a page that hasn't registered
// an action via usePrimaryAction (dashboards, detail views, settings forms).
export default function PrimaryActionFab() {
  const action = usePrimaryActionValue();
  if (!action) return null;

  return (
    <button type="button" className="primary-action-fab" onClick={action.onClick} aria-label={action.label}>
      <PlusIcon className="h-6 w-6" />
    </button>
  );
}
