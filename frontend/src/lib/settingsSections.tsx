import type { ReactNode } from 'react';
import {
  BriefcaseIcon,
  BuildingIcon,
  GridIcon,
  ListIcon,
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
    groups.push({
      groupLabel: 'Company',
      items: [
        { to: 'appearance', label: 'Appearance', desc: 'Currency and theme for the workspace.', icon: <BuildingIcon /> },
        { to: 'users', label: 'Users', desc: 'Invite people and manage roles.', icon: <TeamIcon /> },
        { to: 'public-forms', label: 'Public Forms', desc: 'External intake forms per module.', icon: <ListIcon /> },
        { to: 'pipelines', label: 'Pipelines', desc: 'Sales stages and their outcomes.', icon: <TrendingIcon /> },
      ],
    });
  }

  return groups;
}
