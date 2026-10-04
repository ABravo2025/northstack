import { API_BASE_URL } from '../api/http';

// Admin Center v2, stage 5: a support session lives only in the browser tab it was opened in
// (sessionStorage), so it never replaces or logs out whoever is signed in normally in the same
// browser (localStorage 'token').
export const SUPPORT_TOKEN_KEY = 'nsSupportToken';

export function getSupportToken(): string | null {
  try {
    return sessionStorage.getItem(SUPPORT_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function isSupportTab(): boolean {
  return getSupportToken() !== null;
}

// /support-session#<one-time code>: exchanges the code (valid 60 s) for the support session, then
// opens the app. The code is in the URL fragment, which browsers never send to a server.
export async function redeemSupportEntry(code: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/support-access/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.token) throw new Error(body.error ?? 'This support link is no longer valid.');
  sessionStorage.setItem(SUPPORT_TOKEN_KEY, body.token);
}
