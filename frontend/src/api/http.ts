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

// The token backing the app's currently active session — kept in sync by App.tsx (a `[token]`
// effect) so a 401 can be checked against it below, not just "was some Authorization header
// present." Some pages (AcceptInvitePage, ResetPasswordPage, ContractConfirmationPage,
// CompleteSignupPage) make authenticated calls with a freshly-minted token that never becomes
// the app's active session — e.g. AcceptInvitePage's /accept-invite/:token route isn't gated by
// isAuthenticated, so someone already logged in can open an invite link and log in/register a
// second, unrelated account there. If that second account's token 401s for its own reasons (e.g.
// an inactive account: authenticateToken rejects non-'active' users even though login doesn't
// check status), it must not force-clear the first, still-valid session — found 2026-09-11.
let activeSessionToken: string | null = null;

export function setActiveSessionToken(token: string | null): void {
  activeSessionToken = token;
}

// Extracts the bearer token value from this request's Authorization header, if any — an
// anonymous request (login, register, forgot-password) legitimately returning 401 for wrong
// credentials is a normal response its own caller already handles (e.g. LoginPage's error toast),
// not a sign that any session expired.
function bearerToken(init?: RequestInit): string | null {
  const headers = init?.headers;
  if (!headers) return null;
  let value: string | null | undefined;
  if (headers instanceof Headers) {
    value = headers.get('Authorization');
  } else if (Array.isArray(headers)) {
    value = headers.find(([key]) => key.toLowerCase() === 'authorization')?.[1];
  } else {
    const key = Object.keys(headers).find((k) => k.toLowerCase() === 'authorization');
    value = key ? (headers as Record<string, string>)[key] : undefined;
  }
  return value ? value.replace(/^Bearer\s+/i, '') : null;
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

  if (res.status === 401) {
    const token = bearerToken(init);
    if (token && token === activeSessionToken) {
      unauthorizedHandler?.();
    }
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
