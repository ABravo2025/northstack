import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import { BriefcaseIcon, ChevronLeftIcon, CreditCardIcon, DashboardIcon, GearIcon, ListIcon, PlusIcon, TeamIcon, XIcon } from '../common/Icons';
import { usePermissions } from '../../contexts/PermissionsContext';

interface PayrollSidebarProps {
  token: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

// Payroll v2 (spec-payroll-v2.md §1): swapped in for the main Sidebar anywhere under /payroll (see
// AppLayout.tsx), same mechanism as ShiftsSidebar. Everyone sees their own payslips; the rest is
// for the owner and whoever has manage_payroll. Settings live in Settings → Payroll and are linked
// here, like Shifts and Time Off.
export default function PayrollSidebar({ token, mobileOpen, onMobileClose }: PayrollSidebarProps) {
  const { t } = useTranslation('hr');
  const navigate = useNavigate();
  const permissions = usePermissions();
  const canManage = permissions.has('manage_payroll');
  const [counts, setCounts] = useState({ drafts: 0, unconfirmed: 0 });

  useEffect(() => {
    if (!canManage) return;
    Promise.all([api.listPayrollRuns(token), api.getCompensationStatus(token)])
      .then(([runs, people]) =>
        setCounts({
          drafts: runs.filter((r) => r.status === 'draft').length,
          unconfirmed: people.filter((p) => p.currentCompensation && !p.isConfirmed).length,
        }),
      )
      .catch(() => undefined);
  }, [token, canManage]);

  const linkClass = ({ isActive }: { isActive: boolean }) => `sidebar-link${isActive ? ' active' : ''}`;
  const badge = (n: number) =>
    n > 0 ? <span className="ml-auto rounded-full bg-accent px-1.5 text-2xs leading-5 font-semibold text-white dark:bg-brand-blue-light dark:text-dark-page">{n}</span> : null;

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onMobileClose} />}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <button className="sidebar-toggle-mobile" onClick={onMobileClose} aria-label={t('payroll.nav.back')}>
          <XIcon className="h-4 w-4" />
        </button>

        <div>
          <button type="button" className="sidebar-link w-full text-left" onClick={() => navigate('/overview')}>
            <ChevronLeftIcon className="h-4 w-4 shrink-0" />
            {t('payroll.nav.back')}
          </button>
        </div>

        <div className="sidebar-divider">
          <p className="sidebar-group-label">{t('payroll.nav.section')}</p>
          {canManage && (
            <>
              <NavLink to="/payroll" end className={linkClass} onClick={onMobileClose}>
                <DashboardIcon className="h-4 w-4 shrink-0" />
                {t('payroll.nav.overview')}
              </NavLink>
              <NavLink to="/payroll/runs" className={linkClass} onClick={onMobileClose}>
                <BriefcaseIcon className="h-4 w-4 shrink-0" />
                {t('payroll.nav.runs')}
                {badge(counts.drafts)}
              </NavLink>
              <NavLink to="/payroll/one-off" className={linkClass} onClick={onMobileClose}>
                <PlusIcon className="h-4 w-4 shrink-0" />
                {t('payroll.nav.oneoff')}
              </NavLink>
              <NavLink to="/payroll/people" className={linkClass} onClick={onMobileClose}>
                <TeamIcon className="h-4 w-4 shrink-0" />
                {t('payroll.nav.people')}
                {badge(counts.unconfirmed)}
              </NavLink>
              <NavLink to="/payroll/payslips" className={linkClass} onClick={onMobileClose}>
                <ListIcon className="h-4 w-4 shrink-0" />
                {t('payroll.nav.payslips')}
              </NavLink>
            </>
          )}
          <NavLink to="/payroll/mine" className={linkClass} onClick={onMobileClose}>
            <CreditCardIcon className="h-4 w-4 shrink-0" />
            {t('payroll.nav.mine')}
          </NavLink>
          {canManage && (
            <button
              type="button"
              className="sidebar-link w-full text-left"
              onClick={() => {
                navigate('/settings/payroll');
                onMobileClose();
              }}
            >
              <GearIcon className="h-4 w-4 shrink-0" />
              {t('payroll.nav.settings')}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
