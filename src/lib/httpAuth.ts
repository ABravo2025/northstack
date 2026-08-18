import type express from 'express';
import { authenticateToken } from '../modules/auth/authService.js';

export function getBearerToken(req: express.Request): string | null {
  return req.headers.authorization?.replace('Bearer ', '') ?? null;
}

export function getClientIp(req: express.Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
}

export async function authenticateUser(req: express.Request, res: express.Response) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  const user = await authenticateToken(token);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  return user;
}

export async function validateSession(req: express.Request, res: express.Response) {
  const user = await authenticateUser(req, res);
  if (!user) {
    return null;
  }

  if (!user.tenantId) {
    res.status(403).json({ error: 'Tenant access required' });
    return null;
  }

  // Suspended (spec-subscription-plans.md: trial + grace period both lapsed) goes view-only,
  // not a hard lockout — GETs still work so the workspace stays visible, only mutations are
  // blocked, since no billing provider is integrated yet to give a self-serve way to pay and
  // reactivate. Every tenant-scoped route goes through here, so this is the one place to gate.
  if (req.method !== 'GET' && user.tenant?.status === 'suspended') {
    res.status(403).json({ error: 'Your workspace is in view-only mode until your subscription is renewed.' });
    return null;
  }

  return user;
}
