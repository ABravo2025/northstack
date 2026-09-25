import { API_BASE_URL } from '../api/http.js';
import type { Tenant } from '../api';

// Company logo (Settings → Company). Stored in the DB, served by the public
// /api/public/tenant-logo/:id route; `?v=` changes on every upload so the browser can cache it
// forever without ever showing a stale logo.
export function tenantLogoUrl(tenant: Pick<Tenant, 'id' | 'logoUpdatedAt'> | null | undefined): string | null {
  if (!tenant?.logoUpdatedAt) return null;
  return `${API_BASE_URL}/api/public/tenant-logo/${tenant.id}?v=${Date.parse(tenant.logoUpdatedAt)}`;
}

export const LOGO_ACCEPTED_TYPES = ['image/png', 'image/jpeg'];
export const LOGO_MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const LOGO_MAX_DIMENSION = 512;

export type LogoResizeError = 'type' | 'size' | 'decode';

// Scales the picked file down to fit 512×512 (never up) and re-encodes it — PNG stays PNG so a
// transparent background survives, JPG becomes JPG at 0.9. Lands around 50–150 KB, well under the
// server's 512 KB cap, without adding an image library.
export async function resizeLogoFile(file: File): Promise<{ dataUrl: string } | { error: LogoResizeError }> {
  if (!LOGO_ACCEPTED_TYPES.includes(file.type)) return { error: 'type' };
  if (file.size > LOGO_MAX_UPLOAD_BYTES) return { error: 'size' };

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = objectUrl;
    });
    const scale = Math.min(LOGO_MAX_DIMENSION / image.naturalWidth, LOGO_MAX_DIMENSION / image.naturalHeight, 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return { error: 'decode' };
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = file.type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9);
    return { dataUrl };
  } catch {
    return { error: 'decode' };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
