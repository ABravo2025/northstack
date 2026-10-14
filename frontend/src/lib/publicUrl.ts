import { Capacitor } from '@capacitor/core';

// The web address people open from a printed or shared link. Inside the Android app the page's own
// origin is a local one, so use the public app address there.
export function publicOrigin(): string {
  if (Capacitor.isNativePlatform()) return import.meta.env.VITE_PUBLIC_APP_URL ?? 'https://app.joinnorthstack.com';
  return window.location.origin;
}
