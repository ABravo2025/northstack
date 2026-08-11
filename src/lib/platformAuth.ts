import type express from 'express';
import type { PlatformRole } from '@prisma/client';
import { authenticateUser } from './httpAuth.js';

// Platform staff aren't scoped to a tenant, so this checks platformRole
// directly instead of going through validateSession (which requires
// tenantId). platform_admin bypasses the allowed-roles list implicitly —
// callers never need to list it themselves.
export function requirePlatformRole(...allowed: PlatformRole[]) {
  return async (req: express.Request, res: express.Response) => {
    const user = await authenticateUser(req, res);
    if (!user) {
      return null;
    }

    if (!user.platformRole) {
      res.status(403).json({ error: 'Insufficient platform role' });
      return null;
    }

    if (user.platformRole === 'platform_admin' || allowed.includes(user.platformRole)) {
      return user;
    }

    res.status(403).json({ error: 'Insufficient platform role' });
    return null;
  };
}
