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

// Custom Roles Fase J — mirrors PermissionsContext's shape rather than importing the context
// itself, so this stays a plain function usable from anywhere (both callers already have a
// `usePermissions()` value in hand and just pass it through).
export interface SettingsSectionsPermissions {
  isOwner: boolean;
  has: (permission: string) => boolean;
}

// Single source of truth for what's in Settings, consumed by both the tile
// grid (SettingsHomePage) and the left-nav list (SettingsSidebar) — role
// gating only needs to live in one place this way (backlog QA, 2026-08-27).
// Custom Roles Fase J — migrated off the legacy `user.role === 'owner'/'admin'` blanket checks:
// each item is now gated by its own real backend permission (mirroring what its actual page
// requires), not a single "isAdmin" approximation covering 5 differently-permissioned pages. The
// "Company" group heading itself only appears once it actually has something to show.
export function getSettingsSections(permissions: SettingsSectionsPermissions): SettingsSectionGroup[] {
  const accountItems: SettingsSectionItem[] = [
    { to: 'profile', label: 'Profile', desc: 'Name, phone and password.', icon: <UserCircleIcon /> },
    { to: 'integrations', label: 'Integrations', desc: 'Connect Northstack to other tools.', icon: <GridIcon /> },
  ];
  if (permissions.has('manage_billing')) {
    accountItems.push({ to: 'billing', label: 'Billing', desc: 'Plan, invoices and payment method.', icon: <BriefcaseIcon /> });
  }

  const groups: SettingsSectionGroup[] = [{ groupLabel: 'My account', items: accountItems }];

  const companyItems: SettingsSectionItem[] = [];
  if (permissions.has('manage_tenant_settings')) {
    companyItems.push({ to: 'appearance', label: 'Appearance', desc: 'Currency and theme for the workspace.', icon: <BuildingIcon /> });
  }
  if (permissions.has('manage_users')) {
    companyItems.push({ to: 'users', label: 'Users', desc: 'Invite people and manage roles.', icon: <TeamIcon /> });
  }
  if (permissions.has('manage_custom_fields')) {
    companyItems.push({ to: 'public-forms', label: 'Public Forms', desc: 'External intake forms per module.', icon: <ListIcon /> });
    companyItems.push({ to: 'pipelines', label: 'Pipelines', desc: 'Sales stages and their outcomes.', icon: <TrendingIcon /> });
  }
  if (permissions.has('view_activity_log')) {
    companyItems.push({ to: 'activity', label: 'Activity Log', desc: 'Who created, changed, or deleted what.', icon: <ClockIcon /> });
  }
  // Owner-only, unlike the rest of this group — deciding what Admin/Member can do is an
  // ownership-level call, same bar as Billing above.
  if (permissions.isOwner) {
    companyItems.push({
      to: 'roles',
      label: 'Roles & Permissions',
      desc: 'Control what each role can see and do.',
      icon: <LockIcon />,
    });
  }
  if (companyItems.length > 0) {
    groups.push({ groupLabel: 'Company', items: companyItems });
  }

  return groups;
}
