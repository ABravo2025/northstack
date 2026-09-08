import { useEffect, useRef, useState } from 'react';

// Private API reference (spec-private-api-webhooks.md §8) — public, no login required (see
// App.tsx's route comment for why). Renders public/openapi.json with Redoc's standalone bundle,
// loaded from a CDN at runtime rather than installed as an npm dependency (redoc's React wrapper
// pulls in React-agnostic bundling concerns and a fair amount of weight for a single public page;
// the standalone script is the same renderer Redocly's own hosted docs use, confirmed against
// Alejandro's reference screenshot — "API docs by Redocly" in its own footer). Pinned to an exact
// version so a Redoc release can't silently change this page's rendering.
const REDOC_SCRIPT_SRC = 'https://cdn.jsdelivr.net/npm/redoc@2.5.3/bundles/redoc.standalone.js';
const REDOC_SCRIPT_ID = 'redoc-standalone-script';
const SPEC_URL = '/openapi.json';

declare global {
  interface Window {
    Redoc?: {
      init: (specUrl: string, options: Record<string, unknown>, element: HTMLElement) => void;
    };
  }
}

export default function ApiDocsPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function render() {
      if (cancelled || !containerRef.current || !window.Redoc) return;
      window.Redoc.init(
        SPEC_URL,
        {
          hideDownloadButton: false,
          expandResponses: '201,200',
          requiredPropsFirst: true,
        },
        containerRef.current,
      );
    }

    const existing = document.getElementById(REDOC_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      // Script tag already present (e.g. a fast remount in dev) — Redoc may already be on
      // window, or the existing tag's own load handler will fire render() when it finishes.
      if (window.Redoc) render();
      else existing.addEventListener('load', render);
      return () => existing.removeEventListener('load', render);
    }

    const script = document.createElement('script');
    script.id = REDOC_SCRIPT_ID;
    script.src = REDOC_SCRIPT_SRC;
    script.async = true;
    script.onload = render;
    script.onerror = () => !cancelled && setError('Could not load the API reference renderer. Check your connection and reload.');
    document.body.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0 p-6 text-center">
        <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{error}</p>
      </div>
    );
  }

  return <div ref={containerRef} className="min-h-screen bg-white" />;
}
