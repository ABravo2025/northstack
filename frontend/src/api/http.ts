// In production the frontend and backend are served from the same Vercel
// deployment, so requests can be relative (''). Locally, Vite serves the
// frontend on its own port, so we point at the Express dev server directly
// unless VITE_API_BASE_URL overrides it.
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://localhost:3000' : '');

export class ApiError extends Error {
  field?: string;
  // Optional — only set by throwApiError (a real HTTP response), not the network-failure path
  // below. Added for Payments v1's Company↔Stripe link confirmation flow (status 409 means
  // "already linked to a different customer, retry with confirmOverwrite"), but generically
  // useful for any caller that needs to branch on more than just the error message string.
  status?: number;

  constructor(message: string, field?: string, status?: number) {
    super(message);
    this.field = field;
    this.status = status;
  }
}

// Registered once by App.tsx (the only place with access to the session's React state) — lets
// this plain fetch wrapper tell the app "the current session is dead, log the user out" without
// every one of the ~30 api/*.ts modules needing to handle 401 individually. Found via a live
// security-review session (2026-09-10): a session that went invalid mid-use left the whole app
// silently showing misleading "no data" empty states on every page instead of returning to login.
type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

// Only a request that itself carried an Authorization header can mean "the session died" — an
// anonymous request (login, register, forgot-password) legitimately returning 401 for wrong
// credentials is a normal response its own caller already handles (e.g. LoginPage's error toast),
// not a sign that the app's session just expired.
function hadAuthHeader(init?: RequestInit): boolean {
  const headers = init?.headers;
  if (!headers) return false;
  if (headers instanceof Headers) return headers.has('Authorization');
  if (Array.isArray(headers)) return headers.some(([key]) => key.toLowerCase() === 'authorization');
  return Object.keys(headers).some((key) => key.toLowerCase() === 'authorization');
}

export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    // fetch() itself throws on network failures (server unreachable, DNS,
    // CORS) before there's ever a Response to inspect — distinguish that
    // from a normal 4xx/5xx, which throwApiError already handles.
    throw new ApiError("Can't reach the server. Check your connection and try again.");
  }

  if (res.status === 401 && hadAuthHeader(init)) {
    unauthorizedHandler?.();
  }

  return res;
}

export async function throwApiError(res: Response): Promise<never> {
  let message = res.statusText || 'Request failed';
  let field: string | undefined;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
    if (body?.field) field = body.field;
  } catch {
    // response body wasn't JSON, fall back to statusText
  }
  throw new ApiError(message, field, res.status);
}
