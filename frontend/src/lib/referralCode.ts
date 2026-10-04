// Referral program (2026-10-04): a member's link is /register?ref=CODE. The code is remembered for
// REMEMBER_DAYS in this browser so it survives the person browsing around before signing up, and
// it also travels inside the verification email's link (backend) for a different device.
const KEY = 'northstack.referralCode';
const REMEMBER_DAYS = 60;

export function normalizeReferralCode(raw: string | null | undefined): string | null {
  const code = (raw ?? '').trim().toUpperCase();
  return /^[A-Z0-9-]{3,20}$/.test(code) ? code : null;
}

// Reads ?ref= from the current URL; a new one replaces whatever was stored. Returns the code to use.
export function captureReferralCode(search: string = window.location.search): string | null {
  const fromUrl = normalizeReferralCode(new URLSearchParams(search).get('ref'));
  try {
    if (fromUrl) {
      localStorage.setItem(KEY, JSON.stringify({ code: fromUrl, at: Date.now() }));
      return fromUrl;
    }
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { code?: string; at?: number } | null;
    if (stored?.code && stored.at && Date.now() - stored.at < REMEMBER_DAYS * 24 * 60 * 60 * 1000) {
      return normalizeReferralCode(stored.code);
    }
  } catch {
    // storage blocked — the URL is still honored
  }
  return fromUrl;
}

export function forgetReferralCode(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clean up
  }
}
