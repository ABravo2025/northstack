import { useEffect, useState } from 'react';
import { api, type ActivityLogEntry, type TaskEntityType, type TenantUser } from '../api';
import { useToast } from '../components/common/ToastProvider';
import TableSkeleton from '../components/common/TableSkeleton';
import Avatar from '../components/common/Avatar';
import { PencilIcon, PlusIcon, TrashIcon } from '../components/common/Icons';
import DateRangeFilter, { DEFAULT_PRESET, rangeForPreset } from '../components/metrics/DateRangeFilter';
import type { DateRange, PresetKey } from '../lib/dateRangePresets';

interface ActivityLogSettingsPageProps {
  token: string;
  user: { role: string };
}

// Only Employee/Company/Contact/Opportunity have any real data yet (Unit 2 of
// spec-activity-log.md) — widen this list once a later unit wires up more entity types.
const ENTITY_TYPE_OPTIONS: { value: TaskEntityType; label: string }[] = [
  { value: 'employee', label: 'Employee' },
  { value: 'company', label: 'Company' },
  { value: 'contact', label: 'Contact' },
  { value: 'opportunity', label: 'Opportunity' },
];

const ACTION_OPTIONS: { value: 'create' | 'update' | 'delete'; label: string }[] = [
  { value: 'create', label: 'Created' },
  { value: 'update', label: 'Updated' },
  { value: 'delete', label: 'Deleted' },
];

function ActionIcon({ action }: { action: ActivityLogEntry['action'] }) {
  if (action === 'create') return <PlusIcon className="h-3.5 w-3.5" />;
  if (action === 'delete') return <TrashIcon className="h-3.5 w-3.5" />;
  return <PencilIcon className="h-3.5 w-3.5" />;
}

const ENTITY_TYPE_LABEL: Record<TaskEntityType, string> = {
  employee: 'Employee',
  company: 'Company',
  contact: 'Contact',
  opportunity: 'Opportunity',
};

function FeedRow({ entry }: { entry: ActivityLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = entry.changes && entry.changes.length > 0;

  return (
    <div className="activity-feed-row">
      <Avatar firstName={entry.changedBy.firstName} lastName={entry.changedBy.lastName} />
      <div className="min-w-0 flex-1">
        <p className="activity-row-summary">
          <span className={`activity-action-icon activity-action-${entry.action}`}>
            <ActionIcon action={entry.action} />
          </span>
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-muted dark:bg-white/[0.06] dark:text-dark-ink-muted">
            {ENTITY_TYPE_LABEL[entry.entityType]}
          </span>
          {entry.summary}
        </p>
        <span className="activity-row-meta">
          {entry.changedBy.firstName} {entry.changedBy.lastName} · {new Date(entry.changedAt).toLocaleString()}
        </span>
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
      {hasDetail && (
        <button type="button" className="activity-row-toggle shrink-0" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Hide detail' : 'Show detail'}
        </button>
      )}
    </div>
  );
}

// Tenant-wide feed — Settings → Activity Log (spec-activity-log.md decision #4: owner/admin only,
// gated server-side by canViewActivityLog; the route to here is only registered/shown for those
// roles, see settingsSections.tsx). Distinct from EntityActivityList (the per-record modal tab) —
// this one isn't scoped to a single Employee/Company/Contact/Opportunity, so every row carries its
// own entity-type badge.
export default function ActivityLogSettingsPage({ token, user }: ActivityLogSettingsPageProps) {
  const isAdmin = user.role === 'owner' || user.role === 'admin';
  const toast = useToast();
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [users, setUsers] = useState<TenantUser[]>([]);

  const [entityType, setEntityType] = useState<TaskEntityType | ''>('');
  const [action, setAction] = useState<'create' | 'update' | 'delete' | ''>('');
  const [userId, setUserId] = useState('');
  const [presetKey, setPresetKey] = useState<PresetKey>(DEFAULT_PRESET);
  const [range, setRange] = useState<DateRange>(() => rangeForPreset(DEFAULT_PRESET));

  useEffect(() => {
    if (!isAdmin) return;
    api.listTenantUsers(token).then(setUsers).catch(() => {
      /* best-effort — only used for the "Changed by" filter */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .listActivityFeed(token, {
        entityType: entityType || undefined,
        action: action || undefined,
        userId: userId || undefined,
        from: range.since.toISOString(),
        to: range.until.toISOString(),
      })
      .then((page) => {
        setEntries(page.items);
        setCursor(page.nextCursor);
      })
      .catch((error) => toast.error('Failed to load activity: ' + (error as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAdmin, entityType, action, userId, range.since, range.until]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.listActivityFeed(token, {
        entityType: entityType || undefined,
        action: action || undefined,
        userId: userId || undefined,
        from: range.since.toISOString(),
        to: range.until.toISOString(),
        cursor,
      });
      setEntries((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (error) {
      toast.error('Failed to load more activity: ' + (error as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  if (!isAdmin) {
    return (
      <div>
        <div className="page-toolbar no-border">
          <h2>Activity Log</h2>
        </div>
        <p className="text-sm text-ink-muted">Activity Log is only visible to workspace owners and admins.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-toolbar no-border">
        <h2>Activity Log</h2>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="select-compact" value={entityType} onChange={(e) => setEntityType(e.target.value as TaskEntityType | '')}>
          <option value="">All types</option>
          {ENTITY_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select className="select-compact" value={action} onChange={(e) => setAction(e.target.value as typeof action)}>
          <option value="">All actions</option>
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select className="select-compact" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Anyone</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.firstName} {u.lastName}
            </option>
          ))}
        </select>
        <DateRangeFilter presetKey={presetKey} range={range} onChange={(r, key) => { setRange(r); setPresetKey(key); }} />
      </div>

      {loading && <TableSkeleton rows={6} columns={1} />}
      {!loading && entries.length === 0 && <p className="text-sm text-ink-muted">No activity in this range.</p>}
      {!loading && entries.length > 0 && (
        <div className="rounded-md border border-line bg-surface-1 dark:border-dark-line dark:bg-dark-surface">
          {entries.map((entry) => (
            <FeedRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {cursor && !loading && (
        <button type="button" className="btn btn-secondary mt-3" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
