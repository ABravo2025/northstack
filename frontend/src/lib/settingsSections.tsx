import type { ReactNode } from 'react';
import {
  BriefcaseIcon,
  BuildingIcon,
  ClockIcon,
  GridIcon,
  ListIcon,
  LockIcon,
  TeamIcon,
  TrendingIcon,
  UserCircleIcon,
} from '../components/common/Icons';

export interface SettingsSectionItem {
  to: string;
  label: string;
  desc: string;
  icon: ReactNode;
}

export interface SettingsSectionGroup {
  groupLabel: string;
  items: SettingsSectionItem[];
}

// Single source of truth for what's in Settings, consumed by both the tile
// grid (SettingsHomePage) and the left-nav list (SettingsSidebar) — role
// gating only needs to live in one place this way (backlog QA, 2026-08-27).
export function getSettingsSections(user: { role: string }): SettingsSectionGroup[] {
  const isAdmin = user.role === 'owner' || user.role === 'admin';
  const isOwner = user.role === 'owner';

  const accountItems: SettingsSectionItem[] = [
    { to: 'profile', label: 'Profile', desc: 'Name, phone and password.', icon: <UserCircleIcon /> },
    { to: 'integrations', label: 'Integrations', desc: 'Connect Northstack to other tools.', icon: <GridIcon /> },
  ];
  if (isOwner) {
    accountItems.push({ to: 'billing', label: 'Billing', desc: 'Plan, invoices and payment method.', icon: <BriefcaseIcon /> });
  }

  const groups: SettingsSectionGroup[] = [{ groupLabel: 'My account', items: accountItems }];

  if (isAdmin) {
    const companyItems: SettingsSectionItem[] = [
      { to: 'appearance', label: 'Appearance', desc: 'Currency and theme for the workspace.', icon: <BuildingIcon /> },
      { to: 'users', label: 'Users', desc: 'Invite people and manage roles.', icon: <TeamIcon /> },
      { to: 'public-forms', label: 'Public Forms', desc: 'External intake forms per module.', icon: <ListIcon /> },
      { to: 'pipelines', label: 'Pipelines', desc: 'Sales stages and their outcomes.', icon: <TrendingIcon /> },
      { to: 'activity', label: 'Activity Log', desc: 'Who created, changed, or deleted what.', icon: <ClockIcon /> },
    ];
    // Owner-only, unlike the rest of this group — deciding what Admin/Member can do is an
    // ownership-level call, same bar as Billing above.
    if (isOwner) {
      companyItems.push({
        to: 'roles',
        label: 'Roles & Permissions',
        desc: 'Control what Admin and Member can see and do.',
        icon: <LockIcon />,
      });
    }
    groups.push({ groupLabel: 'Company', items: companyItems });
  }

  return groups;
}
