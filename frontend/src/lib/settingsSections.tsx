import type { ReactNode } from 'react';
import i18n from './i18n';
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
import { isPublicFormsEnabled } from './featureFlags';

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
  const t = i18n.t;
  const accountItems: SettingsSectionItem[] = [
    { to: 'profile', label: t('settings.profile.label'), desc: t('settings.profile.desc'), icon: <UserCircleIcon /> },
    { to: 'integrations', label: t('settings.integrations.label'), desc: t('settings.integrations.desc'), icon: <GridIcon /> },
  ];
  if (permissions.has('manage_billing')) {
    accountItems.push({ to: 'billing', label: t('settings.billing.label'), desc: t('settings.billing.desc'), icon: <BriefcaseIcon /> });
  }

  const groups: SettingsSectionGroup[] = [{ groupLabel: t('settings.myAccount'), items: accountItems }];

  const companyItems: SettingsSectionItem[] = [];
  if (permissions.has('manage_tenant_settings')) {
    companyItems.push({ to: 'appearance', label: t('settings.appearance.label'), desc: t('settings.appearance.desc'), icon: <BuildingIcon /> });
  }
  if (permissions.has('manage_users')) {
    companyItems.push({ to: 'users', label: t('settings.users.label'), desc: t('settings.users.desc'), icon: <TeamIcon /> });
  }
  if (permissions.has('manage_custom_fields')) {
    if (isPublicFormsEnabled()) {
      companyItems.push({ to: 'public-forms', label: t('settings.publicForms.label'), desc: t('settings.publicForms.desc'), icon: <ListIcon /> });
    }
    companyItems.push({ to: 'pipelines', label: t('settings.pipelines.label'), desc: t('settings.pipelines.desc'), icon: <TrendingIcon /> });
  }
  if (permissions.has('view_activity_log')) {
    companyItems.push({ to: 'activity', label: t('settings.activityLog.label'), desc: t('settings.activityLog.desc'), icon: <ClockIcon /> });
  }
  // Owner-only, unlike the rest of this group — deciding what Admin/Member can do is an
  // ownership-level call, same bar as Billing above.
  if (permissions.isOwner) {
    companyItems.push({
      to: 'roles',
      label: t('settings.rolesPermissions.label'),
      desc: t('settings.rolesPermissions.desc'),
      icon: <LockIcon />,
    });
  }
  if (companyItems.length > 0) {
    groups.push({ groupLabel: t('settings.company'), items: companyItems });
  }

  return groups;
}
