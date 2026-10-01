import { createContext, useContext, useMemo } from 'react';
import type { PermissionsPayload } from '../api';

// Plan-tier hiding (2026-10-01) — permissions whose backend gate is "permission AND Growth plan"
// (requirePayrollAccess / requirePaymentsAccess). Folding the plan into has() here mirrors that
// backend gate exactly, so every screen that already checks has('manage_payroll'|'manage_payments')
// hides Payroll/Payments for a Starter tenant instead of showing UI that 403s on click.
const GROWTH_ONLY_PERMISSIONS = new Set(['manage_payroll', 'manage_payments']);

// Custom Roles Fase G — the frontend counterpart to permissionService.ts/fieldVisibilityService.ts.
// `has`/`isFieldHidden` mirror those backend functions exactly (isOwner bypasses everything, a
// field is hidden only if it's in that entity's denylist) so a role's real UI matches what the
// backend actually enforces, not an approximation of it. Populated once per session from
// GET /api/auth/me's `permissions` payload (App.tsx) — never fetched by an individual page.

interface PermissionsContextValue {
  isOwner: boolean;
  // false only for a tenant on Starter — null plan (Free Trial) counts as Growth, same as
  // isGrowthFeatureEnabled/getEffectivePlan.
  growthPlan: boolean;
  roleName: string;
  has: (permission: string) => boolean;
  isFieldHidden: (entityType: string, fieldKey: string) => boolean;
}

// Deny-by-default rather than throwing when there's no Provider above: unlike ToastProvider (always
// mounted at the app root), a page can render for a moment before the session/permissions payload
// has loaded (or, for the pre-auth routes — login, register, accept-invite — never mounts a
// Provider at all). Every consumer should fail closed in that window, not crash.
const DEFAULT_VALUE: PermissionsContextValue = {
  isOwner: false,
  growthPlan: true,
  roleName: '',
  has: () => false,
  isFieldHidden: () => false,
};

const PermissionsContext = createContext<PermissionsContextValue>(DEFAULT_VALUE);

export function PermissionsProvider({
  payload,
  growthPlan,
  children,
}: {
  payload: PermissionsPayload | null;
  growthPlan: boolean;
  children: React.ReactNode;
}) {
  const value = useMemo<PermissionsContextValue>(() => {
    if (!payload) return DEFAULT_VALUE;
    return {
      isOwner: payload.isOwner,
      growthPlan,
      roleName: payload.name,
      has: (permission: string) =>
        (growthPlan || !GROWTH_ONLY_PERMISSIONS.has(permission)) &&
        (payload.isOwner || payload.permissions.includes(permission)),
      isFieldHidden: (entityType: string, fieldKey: string) =>
        !payload.isOwner && (payload.hiddenFields[entityType]?.includes(fieldKey) ?? false),
    };
  }, [payload, growthPlan]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsContextValue {
  return useContext(PermissionsContext);
}
