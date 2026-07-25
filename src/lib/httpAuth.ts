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

  return user;
}
