import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

interface PaddleEvent {
  name: string; // e.g. "checkout.error", "checkout.completed", "checkout.closed"
  error?: { code?: string; detail?: string };
}

declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: 'sandbox' | 'production') => void };
      Initialize: (options: { token: string; eventCallback?: (event: PaddleEvent) => void }) => void;
      Checkout: { open: (options: { transactionId: string }) => void };
    };
  }
}

const PADDLE_SCRIPT_ID = 'paddle-js';
const PADDLE_SCRIPT_SRC = 'https://cdn.paddle.com/paddle/v2/paddle.js';

// Standalone page (outside AppLayout, same convention as /confirm-contract, /apply/:tenantSlug —
// a focused single-purpose destination, no sidebar/topbar chrome needed) opened in a NEW browser
// tab/window by AddPaymentMethodModal.tsx (Alejandro's request, 2026-08-20: the Paddle checkout
// should feel like its own window, not an overlay stacked on top of the current one). This page's
// only job is load Paddle.js, open the Overlay for the transactionId in the URL, and let the
// tenant close the tab when done — AddPaymentMethodModal no longer loads Paddle.js itself at all.
export default function PaddleCheckoutPage() {
  const [searchParams] = useSearchParams();
  const transactionId = searchParams.get('transactionId');
  const [status, setStatus] = useState<'loading' | 'open' | 'completed' | 'error'>('loading');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    if (!transactionId) {
      setStatus('error');
      setErrorDetail('Missing transaction — go back and try again.');
      return;
    }

    const openCheckout = () => {
      if (!window.Paddle) return;
      window.Paddle.Checkout.open({ transactionId });
      setStatus('open');
    };

    if (window.Paddle) {
      openCheckout();
      return;
    }

    if (document.getElementById(PADDLE_SCRIPT_ID)) {
      return;
    }

    const script = document.createElement('script');
    script.id = PADDLE_SCRIPT_ID;
    script.src = PADDLE_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      const clientToken = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;
      if (!clientToken || !window.Paddle) {
        setStatus('error');
        setErrorDetail('Payment provider failed to load.');
        return;
      }
      if (import.meta.env.VITE_PADDLE_ENV !== 'production') {
        window.Paddle.Environment.set('sandbox');
      }
      window.Paddle.Initialize({
        token: clientToken,
        eventCallback: (event) => {
          if (event.name === 'checkout.error') {
            console.error('Paddle checkout.error:', event.error);
            setStatus('error');
            setErrorDetail(event.error?.detail ?? 'Something went wrong.');
          } else if (event.name === 'checkout.completed') {
            setStatus('completed');
          }
        },
      });
      openCheckout();
    };
    document.body.appendChild(script);
  }, [transactionId]);

  return (
    <div className="flex items-center justify-center min-h-screen p-6 text-center">
      {status === 'loading' && <p className="text-ink-muted">Loading checkout…</p>}
      {status === 'open' && <p className="text-ink-muted">Complete your payment in the window above.</p>}
      {status === 'completed' && (
        <div>
          <p className="text-lg font-semibold mb-1">You're all set!</p>
          <p className="text-ink-muted">You can close this tab now.</p>
        </div>
      )}
      {status === 'error' && (
        <div>
          <p className="text-lg font-semibold text-danger mb-1">Something went wrong</p>
          <p className="text-ink-muted">{errorDetail}</p>
        </div>
      )}
    </div>
  );
}
