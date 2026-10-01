import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarIcon, ChevronLeftIcon, FormIcon, TeamIcon, XIcon } from '../common/Icons';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useTimeOffTab, type TimeOffTab } from '../../contexts/TimeOffTabContext';

interface TimeOffSidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

interface TimeOffNavItem {
  key: TimeOffTab;
  labelKey: string;
  icon: ReactNode;
}

// Swapped in for the main Sidebar while on /hr/time-off (see AppLayout.tsx), same mechanism as
// SettingsSidebar/DashboardsSidebar — but these sections aren't routes, they're
// TimeOffOverviewPage's `tab` state, shared via TimeOffTabContext. Three views since 2026-10:
// everyone gets "My time off"; "Team" only for admins/managers/approvers; "Policies" only with
// manage_custom_fields (the same permission the policy routes check server-side).
export default function TimeOffSidebar({ mobileOpen, onMobileClose }: TimeOffSidebarProps) {
  const { t } = useTranslation('tasks');
  const navigate = useNavigate();
  const permissions = usePermissions();
  const { tab, setTab, pendingApprovalsCount, showTeam } = useTimeOffTab();

  const items: TimeOffNavItem[] = [{ key: 'mine', labelKey: 'timeOff.nav.mine', icon: <CalendarIcon className="h-4 w-4 shrink-0" /> }];
  if (showTeam) items.push({ key: 'team', labelKey: 'timeOff.nav.team', icon: <TeamIcon className="h-4 w-4 shrink-0" /> });
  if (permissions.has('manage_custom_fields')) {
    items.push({ key: 'policies', labelKey: 'timeOff.nav.policies', icon: <FormIcon className="h-4 w-4 shrink-0" /> });
  }

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
              {item.icon}
              {t(item.labelKey)}
              {item.key === 'team' && pendingApprovalsCount > 0 && <span className="sidebar-count num">{pendingApprovalsCount}</span>}
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
