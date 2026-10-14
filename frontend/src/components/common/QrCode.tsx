import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeProps {
  // Anything: a link (clock-in sheet), an otpauth:// URI (two-step sign-in, later), plain text.
  value: string;
  size?: number;
  label: string;
  className?: string;
}

// Generic QR (spec-shifts-fase2.md §0.1.7): drawn as SVG from the value, always dark on white so
// any phone camera reads it, in dark mode too. Used by the clock-in sheet today and meant for the
// Google Authenticator setup of two-step sign-in later.
export default function QrCode({ value, size = 200, label, className = '' }: QrCodeProps) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(null));
    return () => {
      alive = false;
    };
  }, [value]);

  return (
    <div
      role="img"
      aria-label={label}
      className={`inline-block rounded-lg bg-white p-2 ${className}`}
      style={{ width: size, height: size }}
      // The SVG comes from the qrcode library, built from our own string — no user HTML.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

// The same QR as SVG markup, for a printable sheet opened in its own window.
export function qrSvg(value: string): Promise<string> {
  return QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
}
