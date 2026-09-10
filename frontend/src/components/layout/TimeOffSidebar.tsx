import { useNavigate } from 'react-router-dom';
import { ChevronLeftIcon, XIcon } from '../common/Icons';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useTimeOffTab, type TimeOffTab } from '../../contexts/TimeOffTabContext';

interface TimeOffSidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

interface TimeOffTabItem {
  key: TimeOffTab;
  label: string;
  permission?: string;
}

const TIME_OFF_TABS: TimeOffTabItem[] = [
  { key: 'my-timeoff', label: 'My Timeoff' },
  { key: 'my-requests', label: 'My Requests' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'balances', label: 'Balances', permission: 'manage_custom_fields' },
  { key: 'all-requests', label: 'All Requests', permission: 'manage_custom_fields' },
  { key: 'policies', label: 'Policies', permission: 'manage_custom_fields' },
  { key: 'assignments', label: 'Assignments', permission: 'manage_custom_fields' },
];

// Swapped in for the main Sidebar while on /hr/time-off (see AppLayout.tsx),
// same mechanism as SettingsSidebar/DashboardsSidebar — but these 7 sections
// aren't routes, they're TimeOffOverviewPage's `tab` state, shared here via
// TimeOffTabContext. Replaces the old .views-bar tab strip, which got
// cramped with 7 tabs on a phone screen (2026-09-09).
export default function TimeOffSidebar({ mobileOpen, onMobileClose }: TimeOffSidebarProps) {
  const navigate = useNavigate();
  const permissions = usePermissions();
  const { tab, setTab, pendingApprovalsCount } = useTimeOffTab();

  const items = TIME_OFF_TABS.filter((item) => !item.permission || permissions.has(item.permission));

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onMobileClose} />}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <button className="sidebar-toggle-mobile" onClick={onMobileClose} aria-label="Close menu">
          <XIcon className="h-4 w-4" />
        </button>

        <div>
          <button type="button" className="sidebar-link w-full text-left" onClick={() => navigate('/overview')}>
            <ChevronLeftIcon className="h-4 w-4 shrink-0" />
            Back
          </button>
        </div>

        <div className="sidebar-divider">
          <p className="sidebar-group-label">Time Off</p>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`sidebar-link w-full text-left ${tab === item.key ? 'active' : ''}`}
              onClick={() => {
                setTab(item.key);
                onMobileClose();
              }}
            >
              {item.label}
              {item.key === 'approvals' && pendingApprovalsCount > 0 ? ` (${pendingApprovalsCount})` : ''}
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
