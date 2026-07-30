import { useState } from 'react';
import type { TaskEntityType } from '../api';
import EntityTasksList from './EntityTasksList';
import EntityNotesList from './EntityNotesList';

interface TenantUserLite {
  id: string;
  firstName: string;
  lastName: string;
}

interface DetailSidebarProps {
  token: string;
  entityType: TaskEntityType;
  entityId: string;
  tenantUsers: TenantUserLite[];
  currentUserId: string;
}

type SidebarTab = 'notes' | 'tasks' | 'activity';

// Right column of the 2026-07-30 detail-panel redesign — Notes/Tasks/Activity
// tabs, shared verbatim across Employee/Company/Contact/Opportunity (the
// actual cross-entity reuse Checkpoint F was after, now literally one
// component instead of 4 near-copies of this section).
// Activity: confirmed 2026-07-30 to enter as a tab now (reversing the
// 2026-07-29 "side panel, not a tab" call) — still just a placeholder, no
// audit-log system built yet (that's Tier 5).
export default function DetailSidebar({ token, entityType, entityId, tenantUsers, currentUserId }: DetailSidebarProps) {
  const [tab, setTab] = useState<SidebarTab>('notes');
  const [taskCount, setTaskCount] = useState(0);
  const [noteCount, setNoteCount] = useState(0);

  return (
    <div className="overview-panel-right">
      <div className="overview-panel-tabs">
        <button type="button" className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>
          Notes{noteCount > 0 ? ` (${noteCount})` : ''}
        </button>
        <button type="button" className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>
          Tasks{taskCount > 0 ? ` (${taskCount})` : ''}
        </button>
        <button type="button" className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>
          Activity
        </button>
      </div>
      <div className="overview-panel-right-body">
        {/* Notes/Tasks mounted regardless of the active tab (just hidden) so
            their count badges stay accurate before the user opens that tab —
            same pattern the old top-level Employee tabs used. */}
        <div style={{ display: tab === 'notes' ? undefined : 'none' }}>
          <EntityNotesList token={token} entityType={entityType} entityId={entityId} onCountChange={setNoteCount} />
        </div>
        <div style={{ display: tab === 'tasks' ? undefined : 'none' }}>
          <EntityTasksList
            token={token}
            entityType={entityType}
            entityId={entityId}
            tenantUsers={tenantUsers}
            currentUserId={currentUserId}
            onCountChange={setTaskCount}
          />
        </div>
        {tab === 'activity' && <p className="overview-panel-placeholder">Nothing here yet.</p>}
      </div>
    </div>
  );
}
