import { createContext, useContext, useMemo } from 'react';
import type { PermissionsPayload } from '../api';

// Custom Roles Fase G — the frontend counterpart to permissionService.ts/fieldVisibilityService.ts.
// `has`/`isFieldHidden` mirror those backend functions exactly (isOwner bypasses everything, a
// field is hidden only if it's in that entity's denylist) so a role's real UI matches what the
// backend actually enforces, not an approximation of it. Populated once per session from
// GET /api/auth/me's `permissions` payload (App.tsx) — never fetched by an individual page.

interface PermissionsContextValue {
  isOwner: boolean;
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
  roleName: '',
  has: () => false,
  isFieldHidden: () => false,
};

const PermissionsContext = createContext<PermissionsContextValue>(DEFAULT_VALUE);

export function PermissionsProvider({ payload, children }: { payload: PermissionsPayload | null; children: React.ReactNode }) {
  const value = useMemo<PermissionsContextValue>(() => {
    if (!payload) return DEFAULT_VALUE;
    return {
      isOwner: payload.isOwner,
      roleName: payload.name,
      has: (permission: string) => payload.isOwner || payload.permissions.includes(permission),
      isFieldHidden: (entityType: string, fieldKey: string) =>
        !payload.isOwner && (payload.hiddenFields[entityType]?.includes(fieldKey) ?? false),
    };
  }, [payload]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsContextValue {
  return useContext(PermissionsContext);
}
