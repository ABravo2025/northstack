import { rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';
import type { TenantBranding } from '../modules/tenant/tenantProfileService.js';

const LOGO_MAX_WIDTH = 140;
const LOGO_MAX_HEIGHT = 50;
const DETAIL_MAX_CHARS = 95;

// pdf-lib's standard Helvetica only encodes WinAnsi (≈ Latin-1) — a character outside it (an
// emoji, a CJK name, "→") makes drawText throw and the whole PDF fail. Company details are
// free-form user input, so anything unencodable is swapped for "?" instead.
function toWinAnsiSafe(text: string): string {
  return text.replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
}

function truncate(text: string): string {
  return text.length > DETAIL_MAX_CHARS ? `${text.slice(0, DETAIL_MAX_CHARS - 3)}...` : text;
}

// Shared by payslipService.ts and contractPdfService.ts — the company logo (top-right corner,
// scaled to fit) plus name, legal name, address and phone/website (Settings → Company). `y` is
// where the name line goes; returns the y below the last line drawn.
export async function drawCompanyHeader(params: {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  boldFont: PDFFont;
  branding: TenantBranding;
  y: number;
}): Promise<number> {
  const { doc, page, font, boldFont, branding } = params;
  let y = params.y;

  if (branding.logo) {
    // A corrupt/unsupported image shouldn't block a payslip or contract — the header just
    // renders without it (the upload endpoint already checks magic bytes, so this is rare).
    try {
      const image =
        branding.logo.mimeType === 'image/png'
          ? await doc.embedPng(branding.logo.bytes)
          : await doc.embedJpg(branding.logo.bytes);
      const scale = Math.min(LOGO_MAX_WIDTH / image.width, LOGO_MAX_HEIGHT / image.height, 1);
      const width = image.width * scale;
      const height = image.height * scale;
      const { width: pageWidth, height: pageHeight } = page.getSize();
      page.drawImage(image, { x: pageWidth - 50 - width, y: pageHeight - 40 - height, width, height });
    } catch {
      // intentionally ignored — see above
    }
  }

  page.drawText(toWinAnsiSafe(branding.name), { x: 50, y, size: 18, font: boldFont });
  y -= 28;

  const grey = rgb(0.35, 0.35, 0.35);
  const details = [
    branding.legalName && branding.legalName !== branding.name ? branding.legalName : null,
    branding.address,
    [branding.phone, branding.website].filter(Boolean).join('  ·  ') || null,
  ].filter((line): line is string => Boolean(line));

  for (const line of details) {
    page.drawText(toWinAnsiSafe(truncate(line)), { x: 50, y, size: 9, font, color: grey });
    y -= 13;
  }
  if (details.length > 0) {
    y -= 10;
  }

  return y;
}
