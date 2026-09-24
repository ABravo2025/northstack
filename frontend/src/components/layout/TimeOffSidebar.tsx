import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon, XIcon } from '../common/Icons';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useTimeOffTab, type TimeOffTab } from '../../contexts/TimeOffTabContext';

interface TimeOffSidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

interface TimeOffTabItem {
  key: TimeOffTab;
  labelKey: string;
  permission?: string;
}

const TIME_OFF_TABS: TimeOffTabItem[] = [
  { key: 'my-timeoff', labelKey: 'timeOff.tabs.myTimeoff' },
  { key: 'my-requests', labelKey: 'timeOff.tabs.myRequests' },
  { key: 'approvals', labelKey: 'timeOff.tabs.approvals' },
  { key: 'balances', labelKey: 'timeOff.tabs.balances', permission: 'manage_custom_fields' },
  { key: 'all-requests', labelKey: 'timeOff.tabs.allRequests', permission: 'manage_custom_fields' },
  { key: 'policies', labelKey: 'timeOff.tabs.policies', permission: 'manage_custom_fields' },
  { key: 'assignments', labelKey: 'timeOff.tabs.assignments', permission: 'manage_custom_fields' },
];

// Swapped in for the main Sidebar while on /hr/time-off (see AppLayout.tsx),
// same mechanism as SettingsSidebar/DashboardsSidebar — but these 7 sections
// aren't routes, they're TimeOffOverviewPage's `tab` state, shared here via
// TimeOffTabContext. Replaces the old .views-bar tab strip, which got
// cramped with 7 tabs on a phone screen (2026-09-09).
export default function TimeOffSidebar({ mobileOpen, onMobileClose }: TimeOffSidebarProps) {
  const { t } = useTranslation('tasks');
  const navigate = useNavigate();
  const permissions = usePermissions();
  const { tab, setTab, pendingApprovalsCount } = useTimeOffTab();

  const items = TIME_OFF_TABS.filter((item) => !item.permission || permissions.has(item.permission));

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onMobileClose} />}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <button className="sidebar-toggle-mobile" onClick={onMobileClose} aria-label={t('timeOff.back')}>
          <XIcon className="h-4 w-4" />
        </button>

        <div>
          <button type="button" className="sidebar-link w-full text-left" onClick={() => navigate('/overview')}>
            <ChevronLeftIcon className="h-4 w-4 shrink-0" />
            {t('timeOff.back')}
          </button>
        </div>

        <div className="sidebar-divider">
          <p className="sidebar-group-label">{t('timeOff.sectionLabel')}</p>
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
              {t(item.labelKey)}
              {item.key === 'approvals' && pendingApprovalsCount > 0 ? ` (${pendingApprovalsCount})` : ''}
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
