import { useEffect, useState } from 'react';
import type { TaskEntityType } from '../../api';
import EntityTasksList from '../tasks/EntityTasksList';
import EntityNotesList from '../notes/EntityNotesList';
import EntityActivityList from '../activity/EntityActivityList';

interface TenantUserLite {
  id: string;
  firstName: string;
  lastName: string;
}

type SidebarTab = 'notes' | 'tasks' | 'activity';

interface DetailSidebarProps {
  token: string;
  entityType: TaskEntityType;
  entityId: string;
  tenantUsers: TenantUserLite[];
  currentUserId: string;
  // Reported on every count change regardless of mode — the parent panel's own mobile tab strip
  // (see below) needs these same numbers for its Notes/Tasks/Activity labels once the panel
  // collapses to a single column.
  onCountsChange?: (counts: { notes: number; tasks: number; activity: number }) => void;
  // Present only on mobile, where the parent panel's own unified tab strip (Overview / Payments /
  // Notes / Tasks / Activity — see EmployeeOverviewPanel.tsx etc.) replaces this component's own
  // tab row: this then just shows whichever of its 3 sections is named here (or nothing, while
  // the parent's current top-level tab is Overview/Payments) instead of managing its own visible
  // tab. Omit entirely for the normal desktop rendering (own tab row, own 360px column, own local
  // tab state) — that path is unchanged from before this prop existed.
  mobileActiveSection?: SidebarTab | null;
}

// Right column of the 2026-07-30 detail-panel redesign — Notes/Tasks/Activity
// tabs, shared verbatim across Employee/Company/Contact/Opportunity (the
// actual cross-entity reuse Checkpoint F was after, now literally one
// component instead of 4 near-copies of this section).
// Activity: confirmed 2026-07-30 to enter as a tab now (reversing the
// 2026-07-29 "side panel, not a tab" call) — real data since spec-activity-log.md (2026-08-30).
//
// Mobile (2026-09-08): a fixed 360px side column with its own scroll doesn't have a natural mobile
// equivalent — forcing it full-width below the profile fields just made the whole panel one very
// long page with no clear "which section am I in" (found live: Notes/Tasks/Activity felt like
// they'd swallowed the profile). The parent panel now drives one unified tab strip instead
// (Overview / Payments / Notes / Tasks / Activity) via mobileActiveSection below.
export default function DetailSidebar({
  token,
  entityType,
  entityId,
  tenantUsers,
  currentUserId,
  onCountsChange,
  mobileActiveSection,
}: DetailSidebarProps) {
  const [tab, setTab] = useState<SidebarTab>('notes');
  const [taskCount, setTaskCount] = useState(0);
  const [noteCount, setNoteCount] = useState(0);
  const [activityCount, setActivityCount] = useState(0);

  useEffect(() => {
    onCountsChange?.({ notes: noteCount, tasks: taskCount, activity: activityCount });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteCount, taskCount, activityCount]);

  // undefined (prop omitted) => desktop, this component owns which of the 3 is visible.
  // null/'notes'/'tasks'/'activity' => mobile, the parent's selection owns it instead.
  const isParentControlled = mobileActiveSection !== undefined;
  const visibleTab = isParentControlled ? mobileActiveSection : tab;

  const sections = (
    <>
      <div style={{ display: visibleTab === 'notes' ? undefined : 'none' }}>
        <EntityNotesList token={token} entityType={entityType} entityId={entityId} onCountChange={setNoteCount} />
      </div>
      <div style={{ display: visibleTab === 'tasks' ? undefined : 'none' }}>
        <EntityTasksList
          token={token}
          entityType={entityType}
          entityId={entityId}
          tenantUsers={tenantUsers}
          currentUserId={currentUserId}
          onCountChange={setTaskCount}
        />
      </div>
      <div style={{ display: visibleTab === 'activity' ? undefined : 'none' }}>
        <EntityActivityList token={token} entityType={entityType} entityId={entityId} onCountChange={setActivityCount} />
      </div>
    </>
  );

  if (isParentControlled) {
    // display:none (not just leaving all 3 sections hidden inside) when mobileActiveSection is
    // null — otherwise this wrapper's own flex-1 still claims a share of the parent's height even
    // though nothing inside it is visible, splitting the mobile Overview/Payments tab down to
    // half the screen for no reason (found 2026-09-08 on a real phone: Overview only got half the
    // available height, forcing a scroll for content that would otherwise fit on one screen).
    return (
      <div className="overview-panel-right-body" style={{ display: mobileActiveSection ? undefined : 'none' }}>
        {sections}
      </div>
    );
  }

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
          Activity{activityCount > 0 ? ` (${activityCount})` : ''}
        </button>
      </div>
      <div className="overview-panel-right-body">{sections}</div>
    </div>
  );
}
