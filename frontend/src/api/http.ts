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

export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    // fetch() itself throws on network failures (server unreachable, DNS,
    // CORS) before there's ever a Response to inspect — distinguish that
    // from a normal 4xx/5xx, which throwApiError already handles.
    throw new ApiError("Can't reach the server. Check your connection and try again.");
  }
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
