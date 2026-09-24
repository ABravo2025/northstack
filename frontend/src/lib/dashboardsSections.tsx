import type { ReactNode } from 'react';
import i18n from './i18n';
import { BriefcaseIcon, CalendarIcon, ListIcon, PeopleIcon, TargetIcon, TrendingIcon } from '../components/common/Icons';

export interface DashboardSectionItem {
  to: string;
  label: string;
  desc: string;
  icon: ReactNode;
  permission?: string;
}

export interface DashboardSectionsPermissions {
  has: (permission: string) => boolean;
}

// Single source of truth for what's in Dashboards, consumed by both the tile
// grid (DashboardsHomePage) and the left-nav list (DashboardsSidebar) —
// mirrors settingsSections.tsx's role as the one place this gating lives.
// A function (not a static array) so labels/descs are resolved with the
// current language every time it's called, same as getSettingsSections.
export function getDashboardSections(permissions: DashboardSectionsPermissions): DashboardSectionItem[] {
  const t = i18n.t;
  const sections: DashboardSectionItem[] = [
    {
      to: '/dashboards/hr',
      label: t('sections.hr.label', { ns: 'dashboards' }),
      desc: t('sections.hr.desc', { ns: 'dashboards' }),
      icon: <PeopleIcon />,
      permission: 'view_dashboards',
    },
    {
      to: '/dashboards/time-off',
      label: t('sections.timeOff.label', { ns: 'dashboards' }),
      desc: t('sections.timeOff.desc', { ns: 'dashboards' }),
      icon: <CalendarIcon />,
      permission: 'view_dashboards',
    },
    {
      to: '/dashboards/payroll',
      label: t('sections.payroll.label', { ns: 'dashboards' }),
      desc: t('sections.payroll.desc', { ns: 'dashboards' }),
      icon: <BriefcaseIcon />,
      permission: 'manage_payroll',
    },
    {
      to: '/dashboards/sales',
      label: t('sections.sales.label', { ns: 'dashboards' }),
      desc: t('sections.sales.desc', { ns: 'dashboards' }),
      icon: <TargetIcon />,
      permission: 'view_dashboards',
    },
    {
      to: '/dashboards/tasks',
      label: t('sections.tasks.label', { ns: 'dashboards' }),
      desc: t('sections.tasks.desc', { ns: 'dashboards' }),
      icon: <ListIcon />,
      permission: 'view_dashboards',
    },
    {
      to: '/dashboards/adoption',
      label: t('sections.adoption.label', { ns: 'dashboards' }),
      desc: t('sections.adoption.desc', { ns: 'dashboards' }),
      icon: <TrendingIcon />,
      permission: 'view_dashboards',
    },
  ];
  return sections.filter((s) => !s.permission || permissions.has(s.permission));
}
