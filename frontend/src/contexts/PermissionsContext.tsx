import { createContext, useContext, useMemo } from 'react';
import type { PermissionsPayload, PlanFeatures } from '../api';

// Plan-tier hiding (2026-10-01) — permissions whose backend gate is "permission AND Growth plan"
// (requirePayrollAccess / requirePaymentsAccess). Folding the plan into has() here mirrors that
// backend gate exactly, so every screen that already checks has('manage_payroll'|'manage_payments')
// hides Payroll/Payments for a Starter tenant instead of showing UI that 403s on click.
// manage_api_access joined 2026-10-01 (Private API keys + webhooks became Growth-only).
// Since 2026-10-03 the gate is per module (`features`, from the backend: plan + any Admin Center
// agreement), so a Starter client given Payroll by agreement sees it, and a Growth client with it
// switched off doesn't.
const PERMISSION_FEATURE: Record<string, keyof PlanFeatures> = {
  manage_payroll: 'payroll',
  manage_payments: 'payments',
  manage_api_access: 'apiAccess',
  // use_ai_assistants joined 2026-10-02 (spec-mcp-server.md §2b) — same module as the API.
  use_ai_assistants: 'apiAccess',
};

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
  // Plan-gated modules this tenant has (plan + Admin Center agreement).
  features: PlanFeatures;
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
  features: { payroll: true, payments: true, apiAccess: true, projectTemplates: true, shiftSkills: true },
  roleName: '',
  has: () => false,
  isFieldHidden: () => false,
};

const PermissionsContext = createContext<PermissionsContextValue>(DEFAULT_VALUE);

export function PermissionsProvider({
  payload,
  growthPlan,
  features,
  children,
}: {
  payload: PermissionsPayload | null;
  growthPlan: boolean;
  features: PlanFeatures;
  children: React.ReactNode;
}) {
  // Primitive deps: callers build `features` fresh on every render.
  const { payroll, payments, apiAccess, projectTemplates, shiftSkills } = features;
  const value = useMemo<PermissionsContextValue>(() => {
    if (!payload) return DEFAULT_VALUE;
    const features = { payroll, payments, apiAccess, projectTemplates, shiftSkills };
    return {
      isOwner: payload.isOwner,
      growthPlan,
      features,
      roleName: payload.name,
      has: (permission: string) =>
        (!(permission in PERMISSION_FEATURE) || !!features[PERMISSION_FEATURE[permission]]) &&
        (payload.isOwner || payload.permissions.includes(permission)),
      isFieldHidden: (entityType: string, fieldKey: string) =>
        !payload.isOwner && (payload.hiddenFields[entityType]?.includes(fieldKey) ?? false),
    };
  }, [payload, growthPlan, payroll, payments, apiAccess, projectTemplates, shiftSkills]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsContextValue {
  return useContext(PermissionsContext);
}
