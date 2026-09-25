import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '../../contexts/PermissionsContext';
import { isGrowthFeatureEnabled } from '../../lib/planLimits';
import { tenantLogoUrl } from '../../lib/tenantLogo';
import type { Tenant } from '../../api';
import {
  BriefcaseIcon,
  BuildingIcon,
  CalendarIcon,
  ChevronLeftIcon,
  CreditCardIcon,
  DashboardIcon,
  GearIcon,
  HomeIcon,
  PeopleIcon,
  TargetIcon,
  TaskCircleIcon,
  UserCircleIcon,
  XIcon,
} from '../common/Icons';

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
  tenant: Tenant | null;
}

export default function Sidebar({ mobileOpen, onMobileClose, tenant }: SidebarProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  // Custom Roles Fase J — migrated off `user.role === 'owner'` (Payroll/Payments were shown to
  // owner only, matching their real backend gates being owner-only by default, but never
  // reachable by a custom role granted manage_payroll/manage_payments explicitly).
  const permissions = usePermissions();
  // Plan-tier enforcement (2026-09-07) — Payroll/Payments are Growth-only; a Starter tenant
  // simply doesn't see the nav item, rather than clicking through to a 403.
  const growthPlan = isGrowthFeatureEnabled(tenant);
  // "Protect internal company data" rework — Companies/Contacts/Opportunities are no longer
  // default Member access (see MEMBER_SEED_PERMISSIONS's comment in roleService.ts), so these
  // links need the same has()-gating Payroll/Payments already got in Fase J, instead of always
  // showing a link that now 403s for a plain Member. canSeeOpportunity mirrors the backend's
  // derived canViewOpportunity (permissionService.ts): needs both Company AND Contact view.
  const canSeeCompany = permissions.has('view_company');
  const canSeeContact = permissions.has('view_contact');
  const canSeeOpportunity = canSeeCompany && canSeeContact;
  const canSeePayments = permissions.has('manage_payments') && growthPlan;
  const showSalesGroup = canSeeCompany || canSeeContact || canSeeOpportunity || canSeePayments;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `sidebar-link${isActive ? ' active' : ''}${collapsed ? ' justify-center' : ''}`;

  const label = (text: string) => (collapsed ? undefined : text);
  const logoUrl = tenantLogoUrl(tenant);

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onMobileClose} />}
      <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <button
          className="sidebar-toggle-desktop"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
        >
          <ChevronLeftIcon className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
        <button className="sidebar-toggle-mobile" onClick={onMobileClose} aria-label={t('sidebar.closeMenu')}>
          <XIcon className="h-4 w-4" />
        </button>

        {/* Company identity (Settings → Company): the tenant's logo, or its name when there's no
            logo yet. Hidden when collapsed without a logo — a truncated name in 56px says nothing. */}
        {tenant && (logoUrl || !collapsed) && (
          <div className={`sidebar-company${collapsed ? ' sidebar-company-collapsed' : ''}`} title={tenant.name}>
            {logoUrl ? <img src={logoUrl} alt={tenant.name} /> : <span>{tenant.name}</span>}
          </div>
        )}

        <div>
          <NavLink to="/overview" className={linkClass} title={t('sidebar.overview')} onClick={onMobileClose} data-tour="nav-overview">
            <HomeIcon className="h-4 w-4 shrink-0" />
            {label(t('sidebar.overview'))}
          </NavLink>
          <NavLink to="/tasks" className={linkClass} title={t('sidebar.myTasks')} onClick={onMobileClose} data-tour="nav-tasks">
            <TaskCircleIcon className="h-4 w-4 shrink-0" />
            {label(t('sidebar.myTasks'))}
          </NavLink>
          <NavLink to="/dashboards" className={linkClass} title={t('sidebar.dashboards')} onClick={onMobileClose}>
            <DashboardIcon className="h-4 w-4 shrink-0" />
            {label(t('sidebar.dashboards'))}
          </NavLink>
        </div>

        <div className="sidebar-divider">
          {!collapsed && <p className="sidebar-group-label">{t('sidebar.humanResources')}</p>}
          <NavLink to="/hr/people" className={linkClass} title={t('sidebar.people')} onClick={onMobileClose} data-tour="nav-hr">
            <PeopleIcon className="h-4 w-4 shrink-0" />
            {label(t('sidebar.people'))}
          </NavLink>
          <NavLink to="/hr/time-off" className={linkClass} title={`${t('sidebar.humanResources')} – ${t('sidebar.timeOff')}`} onClick={onMobileClose}>
            <CalendarIcon className="h-4 w-4 shrink-0" />
            {label(t('sidebar.timeOff'))}
          </NavLink>
          {permissions.has('manage_payroll') && growthPlan && (
            <NavLink to="/hr/payroll" className={linkClass} title={`${t('sidebar.humanResources')} – ${t('sidebar.payroll')}`} onClick={onMobileClose}>
              <BriefcaseIcon className="h-4 w-4 shrink-0" />
              {label(t('sidebar.payroll'))}
            </NavLink>
          )}
        </div>

        {showSalesGroup && (
          <div className="sidebar-divider">
            {!collapsed && <p className="sidebar-group-label">{t('sidebar.sales')}</p>}
            {canSeeCompany && (
              <NavLink to="/companies" className={linkClass} title={t('sidebar.companies')} onClick={onMobileClose} data-tour="nav-sales">
                <BuildingIcon className="h-4 w-4 shrink-0" />
                {label(t('sidebar.companies'))}
              </NavLink>
            )}
            {canSeeContact && (
              <NavLink to="/contacts" className={linkClass} title={t('sidebar.contacts')} onClick={onMobileClose}>
                <UserCircleIcon className="h-4 w-4 shrink-0" />
                {label(t('sidebar.contacts'))}
              </NavLink>
            )}
            {canSeeOpportunity && (
              <NavLink to="/opportunities" className={linkClass} title={t('sidebar.opportunities')} onClick={onMobileClose}>
                <TargetIcon className="h-4 w-4 shrink-0" />
                {label(t('sidebar.opportunities'))}
              </NavLink>
            )}
            {canSeePayments && (
              <NavLink to="/payments" className={linkClass} title={t('sidebar.payments')} onClick={onMobileClose}>
                <CreditCardIcon className="h-4 w-4 shrink-0" />
                {label(t('sidebar.payments'))}
              </NavLink>
            )}
          </div>
        )}

        <div className="sidebar-footer">
          <NavLink to="/settings" className={linkClass} title={t('sidebar.settings')} onClick={onMobileClose} data-tour="nav-settings">
            <GearIcon className="h-4 w-4 shrink-0" />
            {label(t('sidebar.settings'))}
          </NavLink>
        </div>
      </aside>
    </>
  );
}
