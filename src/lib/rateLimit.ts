import { Ratelimit, type Duration } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Upstash Redis (HTTP-based, serverless-friendly) — replaces the old in-memory Map, which reset on
// every Vercel cold start and never actually enforced a real global limit. Sliding-window counters
// live in Redis with their own TTL, so no cleanup cron is needed — deliberately chosen over a
// Postgres-backed counter table for exactly that reason (Northstack is out of free Vercel cron
// slots; see the 2026-09-10 security-audit follow-up). Callers should still prefix keys with a
// scope (e.g. `login:${ip}`) so unrelated endpoints hitting the same IP/key don't share a bucket.

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

if (!redis) {
  console.warn('UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN not configured — rate limiting is disabled');
}

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

// One Ratelimit instance per distinct (windowMs, maxRequests) pair, created lazily and reused —
// Upstash's own recommended pattern. This app only has a handful of distinct profiles in practice
// (the default, AUTH_RATE_LIMIT, and externalApi.ts's own higher-volume per-key limit).
const limiters = new Map<string, Ratelimit>();

function getLimiter(windowMs: number, maxRequests: number): Ratelimit {
  const cacheKey = `${windowMs}:${maxRequests}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: redis!,
      // The `Duration` type is a union of template-literal types (`${number} ms` etc.), which
      // doesn't infer cleanly from a runtime `number` variable — the cast is safe since the string
      // is always built in exactly that shape.
      limiter: Ratelimit.slidingWindow(maxRequests, `${windowMs} ms` as Duration),
      prefix: 'ratelimit',
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

// Fails OPEN (never blocks) when Redis isn't configured or unreachable — rate limiting is
// defense-in-depth here, not the only protection (passwords are scrypt-hashed, session/reset/
// invitation tokens are cryptographically random), so an Upstash outage or a not-yet-configured
// local/preview environment should never turn into a site-wide login/signup outage.
export async function isRateLimited(key: string, options?: RateLimitOptions): Promise<boolean> {
  if (!redis) {
    return false;
  }

  const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
  const maxRequests = options?.maxRequests ?? DEFAULT_MAX_REQUESTS;

  try {
    const { success } = await getLimiter(windowMs, maxRequests).limit(key);
    return !success;
  } catch (error) {
    console.error(`Rate limit check failed for key "${key}" — allowing the request through:`, error);
    return false;
  }
}
