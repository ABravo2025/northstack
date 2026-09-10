import type { ReactNode } from 'react';
import { BriefcaseIcon, CalendarIcon, ListIcon, PeopleIcon, TargetIcon, TrendingIcon } from '../components/common/Icons';

export interface DashboardSectionItem {
  to: string;
  label: string;
  desc: string;
  icon: ReactNode;
  permission?: string;
}

// Single source of truth for what's in Dashboards, consumed by both the tile
// grid (DashboardsHomePage) and the left-nav list (DashboardsSidebar) —
// mirrors settingsSections.tsx's role as the one place this gating lives.
export const DASHBOARD_SECTIONS: DashboardSectionItem[] = [
  { to: '/dashboards/hr', label: 'HR', desc: 'Headcount, tenure and org composition.', icon: <PeopleIcon /> },
  { to: '/dashboards/time-off', label: 'Time Off', desc: 'Balances, usage and policy trends.', icon: <CalendarIcon /> },
  {
    to: '/dashboards/payroll',
    label: 'Payroll',
    desc: 'Runs, cost and payment activity.',
    icon: <BriefcaseIcon />,
    permission: 'manage_payroll',
  },
  { to: '/dashboards/sales', label: 'Sales', desc: 'Pipeline health and opportunity trends.', icon: <TargetIcon /> },
  { to: '/dashboards/tasks', label: 'Tasks', desc: 'Completion rates and workload.', icon: <ListIcon /> },
  { to: '/dashboards/adoption', label: 'Adoption', desc: 'Feature usage across the workspace.', icon: <TrendingIcon /> },
];

export interface DashboardSectionsPermissions {
  has: (permission: string) => boolean;
}

export function getDashboardSections(permissions: DashboardSectionsPermissions): DashboardSectionItem[] {
  return DASHBOARD_SECTIONS.filter((s) => !s.permission || permissions.has(s.permission));
}
