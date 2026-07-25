// Best-effort in-memory rate limiter, keyed by an arbitrary string (callers
// should prefix with a scope, e.g. `login:${ip}`, so unrelated endpoints
// hitting the same IP don't share a bucket). On serverless (Vercel), each
// cold-started instance starts with an empty map, so this does not enforce a
// hard global limit across all traffic — if that's ever needed, move
// counters to the DB or a shared store (e.g. Redis) instead of expanding
// this file.
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 5;

// Auth endpoints are prime brute-force/spam targets, so they get a tighter
// window than the general-purpose default (5 attempts per 15 minutes vs. the
// 5-per-minute default above). Shared across auth and tenant registration.
export const AUTH_RATE_LIMIT = { windowMs: 15 * 60_000, maxRequests: 5 };

export interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
}

const hits = new Map<string, number[]>();

export function isRateLimited(key: string, options?: RateLimitOptions): boolean {
  const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
  const maxRequests = options?.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const now = Date.now();
  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= maxRequests) {
    hits.set(key, timestamps);
    return true;
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  return false;
}
