// Best-effort in-memory rate limiter, keyed by IP. Turnstile is the primary
// defense on public-form submits; this is a secondary guard against a single
// IP hammering the endpoint. On serverless (Vercel), each cold-started
// instance starts with an empty map, so this does not enforce a hard global
// limit across all traffic — if that's ever needed, move counters to the DB
// or a shared store (e.g. Redis) instead of expanding this file.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;

const hits = new Map<string, number[]>();

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS) {
    hits.set(key, timestamps);
    return true;
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  return false;
}
