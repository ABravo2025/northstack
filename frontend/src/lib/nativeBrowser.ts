import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

// A Capacitor Android WebView has no browser tabs — window.open() either fails silently or
// opens a second WebView with no chrome (no back button, no address bar), which is unusable for
// an external checkout/redirect flow. On native, route the same "open this external URL" intent
// through Capacitor's Browser plugin (a real Chrome Custom Tab) instead; on web, keep today's
// window.open() so nothing changes there.
export function openExternalUrl(url: string): void {
  if (Capacitor.isNativePlatform()) {
    void Browser.open({ url });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

// Same production origin the Android build's own API calls use (see .env.capacitor) — only
// needed here to resolve a same-app path (below), not for talking to the API.
const APP_ORIGIN = 'https://app.joinnorthstack.com';

// For a path within this app itself (e.g. "/billing/checkout?transactionId=...") rather than a
// third-party URL. On web, window.open already resolves a relative path against whatever origin
// the page is actually running on (localhost:5173 in dev, the real domain in prod) — kept as-is.
// The Capacitor WebView has no such "current origin" to resolve a relative path against (it's
// serving bundled local files), so on native this needs the real domain spelled out.
export function openAppPath(path: string): void {
  openExternalUrl(Capacitor.isNativePlatform() ? `${APP_ORIGIN}${path}` : path);
}
