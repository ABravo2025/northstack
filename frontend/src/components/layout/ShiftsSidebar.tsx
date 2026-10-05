import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import { CalendarIcon, ChevronLeftIcon, ClockIcon, GearIcon, XIcon } from '../common/Icons';
import { usePermissions } from '../../contexts/PermissionsContext';

interface ShiftsSidebarProps {
  token: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

// Whether this person can open the schedule: the whole-schedule permissions, or managing at least
// one location (Location.managerEmployeeId — not a permission the frontend can see, so asked once).
export function useCanSchedule(token: string): boolean | null {
  const permissions = usePermissions();
  const byRole = permissions.has('view_shifts') || permissions.has('manage_shifts');
  const [managesLocation, setManagesLocation] = useState<boolean | null>(byRole ? true : null);
  useEffect(() => {
    if (byRole) return;
    api
      .listShiftLocations(token)
      .then((r) => setManagesLocation(r.locations.length > 0))
      .catch(() => setManagesLocation(false));
  }, [token, byRole]);
  return byRole ? true : managesLocation;
}

// Swapped in for the main Sidebar anywhere under /shifts (see AppLayout.tsx), same mechanism as
// DashboardsSidebar: real routes, so each section has its own URL. Everyone gets "My shifts";
// "Schedule" only for whoever can see or plan shifts; the module's settings for manage_shifts.
export default function ShiftsSidebar({ token, mobileOpen, onMobileClose }: ShiftsSidebarProps) {
  const { t } = useTranslation('shifts');
  const navigate = useNavigate();
  const permissions = usePermissions();
  const canSchedule = useCanSchedule(token);
  const linkClass = ({ isActive }: { isActive: boolean }) => `sidebar-link${isActive ? ' active' : ''}`;

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onMobileClose} />}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <button className="sidebar-toggle-mobile" onClick={onMobileClose} aria-label={t('nav.back')}>
          <XIcon className="h-4 w-4" />
        </button>

        <div>
          <button type="button" className="sidebar-link w-full text-left" onClick={() => navigate('/overview')}>
            <ChevronLeftIcon className="h-4 w-4 shrink-0" />
            {t('nav.back')}
          </button>
        </div>

        <div className="sidebar-divider">
          <p className="sidebar-group-label">{t('nav.section')}</p>
          {canSchedule && (
            <NavLink to="/shifts" end className={linkClass} onClick={onMobileClose}>
              <CalendarIcon className="h-4 w-4 shrink-0" />
              {t('nav.schedule')}
            </NavLink>
          )}
          <NavLink to="/shifts/mine" className={linkClass} onClick={onMobileClose}>
            <ClockIcon className="h-4 w-4 shrink-0" />
            {t('nav.mine')}
          </NavLink>
          {/* Locations and rules live in Settings → Shifts; linked here too so they're found
              where people plan shifts (same as Time Off's settings link). */}
          {permissions.has('manage_shifts') && (
            <button
              type="button"
              className="sidebar-link w-full text-left"
              onClick={() => {
                navigate('/settings/shifts');
                onMobileClose();
              }}
            >
              <GearIcon className="h-4 w-4 shrink-0" />
              {t('nav.settings')}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
