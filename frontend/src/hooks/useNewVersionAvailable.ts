import { useEffect, useState } from 'react';

const BUNDLE_SRC_PATTERN = /\/assets\/index-[\w-]+\.js/;
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

// vercel.json serves index.html as no-store (2026-09-15) so a browser never caches an outdated
// shell going forward, but that does nothing for a tab that's already open and running when a
// new deploy goes out — it just keeps executing the old bundle indefinitely. This periodically
// re-fetches "/" and compares its bundle filename to the one this tab actually loaded, so a
// long-lived session can prompt the user to reload instead of silently drifting behind.
export function useNewVersionAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const scriptEl = document.querySelector('script[src*="/assets/"]');
    const initialSrc = scriptEl?.getAttribute('src');
    if (!initialSrc) {
      // Dev server (no hashed /assets bundle) or unexpected markup — nothing to compare against.
      return;
    }

    let cancelled = false;
    let found = false;

    const check = async () => {
      if (cancelled || found) return;
      try {
        const response = await fetch('/', { cache: 'no-store' });
        const html = await response.text();
        const match = html.match(BUNDLE_SRC_PATTERN);
        if (match && match[0] !== initialSrc) {
          found = true;
          if (!cancelled) setAvailable(true);
        }
      } catch {
        // Offline or a transient network error — retry on the next interval/focus.
      }
    };

    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return available;
}
