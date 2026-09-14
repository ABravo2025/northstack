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
