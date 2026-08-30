import { useEffect, useState } from 'react';
import { api, type ActivityLogEntry, type TaskEntityType } from '../../api';
import { useToast } from '../common/ToastProvider';
import Avatar from '../common/Avatar';
import { PencilIcon, PlusIcon, TrashIcon } from '../common/Icons';

interface EntityActivityListProps {
  token: string;
  entityType: TaskEntityType;
  entityId: string;
  onCountChange?: (count: number) => void;
}

function ActionIcon({ action }: { action: ActivityLogEntry['action'] }) {
  if (action === 'create') return <PlusIcon className="h-3.5 w-3.5" />;
  if (action === 'delete') return <TrashIcon className="h-3.5 w-3.5" />;
  return <PencilIcon className="h-3.5 w-3.5" />;
}

function ActivityRow({ entry }: { entry: ActivityLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = entry.changes && entry.changes.length > 0;

  return (
    <div className="activity-row">
      <div className="activity-row-header">
        <Avatar firstName={entry.changedBy.firstName} lastName={entry.changedBy.lastName} />
        <div className="activity-row-main">
          <p className="activity-row-summary">
            <span className={`activity-action-icon activity-action-${entry.action}`}>
              <ActionIcon action={entry.action} />
            </span>
            {entry.summary}
          </p>
          <span className="activity-row-meta">
            {entry.changedBy.firstName} {entry.changedBy.lastName} · {new Date(entry.changedAt).toLocaleString()}
          </span>
        </div>
        {hasDetail && (
          <button type="button" className="activity-row-toggle" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Hide detail' : 'Show detail'}
          </button>
        )}
      </div>
      {hasDetail && expanded && (
        <ul className="activity-row-changes">
          {entry.changes!.map((change) => (
            <li key={change.field}>
              <span className="activity-change-label">{change.label}</span>
              <span className="activity-change-values">
                {change.oldValue ?? <em>empty</em>} → {change.newValue ?? <em>empty</em>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Read-only feed for the modal's "Activity" tab — shares the entityType/entityId polymorphic
// pattern with EntityNotesList/EntityTasksList, but no compose form and nothing is ever edited
// here (spec-activity-log.md).
export default function EntityActivityList({ token, entityType, entityId, onCountChange }: EntityActivityListProps) {
  const toast = useToast();
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listActivityForEntity(token, entityType, entityId)
      .then((result) => {
        if (cancelled) return;
        setEntries(result);
        onCountChange?.(result.length);
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error('Failed to load activity: ' + (error as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  return (
    <div className="activity-list">
      {loading && <p className="text-xs text-ink-faint">Loading activity…</p>}
      {!loading && entries.length === 0 && <p className="text-xs text-ink-faint">No activity yet.</p>}
      {entries.map((entry) => (
        <ActivityRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
