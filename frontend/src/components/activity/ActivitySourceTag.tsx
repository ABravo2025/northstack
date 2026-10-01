import { useTranslation } from 'react-i18next';
import type { ActivityLogEntry } from '../../api';

// "AI · Claude" / "API · Zapier" next to who made a change (spec-mcp-server.md §6.1). Renders
// nothing for `ui` — a change made in the app itself is the normal case and needs no label.
export default function ActivitySourceTag({ entry }: { entry: Pick<ActivityLogEntry, 'source' | 'sourceClientName'> }) {
  const { t } = useTranslation('notesActivity');
  if (!entry.source || entry.source === 'ui') return null;

  const label = t(`activityLog.source.${entry.source}`);
  return (
    <span className="ml-1 rounded bg-accent-tint px-1.5 py-0.5 text-[11px] font-medium text-accent">
      {entry.sourceClientName ? `${label} · ${entry.sourceClientName}` : label}
    </span>
  );
}
