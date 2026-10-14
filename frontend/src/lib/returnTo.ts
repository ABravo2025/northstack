// After signing in, go back to the page that sent you to the login (a clock-in QR scanned without a
// session, a link from an email). Per-tab and best-effort: storage may be unavailable.
const KEY = 'northstack:returnTo';
const SKIP = new Set(['/', '/login', '/overview']);

export function rememberReturnTo(path: string) {
  if (SKIP.has(path)) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    // ignore
  }
}

// Read without clearing (render-safe: React may run an initializer twice), then clear separately.
export function peekReturnTo(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return v && v.startsWith('/') && !v.startsWith('//') ? v : null;
  } catch {
    return null;
  }
}

export function clearReturnTo() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
