// The MCP server's only way into Northstack (spec-mcp-server.md §2b): plain HTTP to the Private API
// (/api/external/v1/*), carrying the caller's own AI token. Deliberately imports nothing that touches
// the database — the MCP function runs as its own Vercel function, so a crash or flood there can't
// take the app's API down, and every rule (role, Employee scope, hidden fields, plan, suspension,
// rate limits) is enforced once, by the Private API, for both API keys and AI assistants.

export interface PrivateApiResult<T = unknown> {
  ok: boolean;
  status: number;
  body: T;
}

export interface PrivateApiClient {
  get<T = unknown>(path: string, query?: Record<string, string | number | undefined>): Promise<PrivateApiResult<T>>;
  post<T = unknown>(path: string, body: unknown): Promise<PrivateApiResult<T>>;
  patch<T = unknown>(path: string, body: unknown): Promise<PrivateApiResult<T>>;
  delete<T = unknown>(path: string, body?: unknown): Promise<PrivateApiResult<T>>;
  // Every page of a list endpoint, up to `max` items — for summaries that need the whole set.
  getAll<T = unknown>(path: string, query?: Record<string, string | number | undefined>, max?: number): Promise<PrivateApiResult<T[]>>;
}

const PAGE_SIZE = 200;
const DEFAULT_MAX_ITEMS = 1000;

export function createPrivateApiClient(baseUrl: string, token: string): PrivateApiClient {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  // Staging sits behind Vercel Deployment Protection; with "Protection Bypass for Automation"
  // enabled, Vercel injects this env var into every function, so the hop back to the Private API on
  // the same deployment gets through. Unset (production, local) → no header.
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }

  async function request<T>(method: string, path: string, query?: Record<string, string | number | undefined>, body?: unknown): Promise<PrivateApiResult<T>> {
    const url = new URL(`/api/external/v1${path}`, baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
    const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { error: text.slice(0, 300) };
      }
    }
    return { ok: res.ok, status: res.status, body: parsed as T };
  }

  return {
    get: (path, query) => request('GET', path, query),
    post: (path, body) => request('POST', path, undefined, body),
    patch: (path, body) => request('PATCH', path, undefined, body),
    delete: (path, body) => request('DELETE', path, undefined, body),
    async getAll<T>(path: string, query: Record<string, string | number | undefined> = {}, max = DEFAULT_MAX_ITEMS) {
      const items: T[] = [];
      let cursor: string | undefined;
      do {
        const page = await request<{ data: T[]; nextCursor: string | null }>('GET', path, { ...query, limit: PAGE_SIZE, cursor });
        if (!page.ok) return { ok: false, status: page.status, body: page.body as unknown as T[] };
        items.push(...page.body.data);
        cursor = page.body.nextCursor ?? undefined;
      } while (cursor && items.length < max);
      return { ok: true, status: 200, body: items.slice(0, max) };
    },
  };
}
