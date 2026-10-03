import { createHmac, timingSafeEqual } from 'node:crypto';

// Server-side confirmation for destructive tools (spec-mcp-server.md §6.2). The first call never
// deletes: it returns a summary plus a short-lived token, and only a second call carrying that token
// acts. Not relying on the client honoring `destructiveHint`, since some ignore it.
//
// Stateless on purpose (the MCP function keeps no state between requests): the token is an HMAC
// keyed with the caller's own bearer token. The model only ever sees the confirmation token, never
// the bearer token (that lives in the client's connection settings), so it can't mint one itself;
// and a token is bound to one action on one record for one connection, for 5 minutes.

const TTL_MS = 5 * 60_000;

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function issueConfirmationToken(secret: string, action: string, targetId: string, now = Date.now()): string {
  const payload = `${action}|${targetId}|${now + TTL_MS}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(secret, payload)}`;
}

export function verifyConfirmationToken(secret: string, token: string, action: string, targetId: string, now = Date.now()): boolean {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return false;
  const payload = Buffer.from(encoded, 'base64url').toString();
  const expected = sign(secret, payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  const [tokenAction, tokenTarget, expiresAt] = payload.split('|');
  return tokenAction === action && tokenTarget === targetId && Number(expiresAt) > now;
}
