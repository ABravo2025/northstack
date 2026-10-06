import { EMAIL_LOGO_PNG_BASE64 } from './emailLogo.js';

// The one look every email Northstack sends (Alejandro, 2026-10-06; preview:
// claude.ai/artifact/RfSDJoc74AGstbuucZ2WSZ). Always light — the template declares light-only so
// mail clients don't recolor it. mailer.ts's dispatchMail wraps every email's body in it, so each
// send*Email function keeps writing plain paragraphs and links:
// - a paragraph that holds nothing but one link becomes the violet button, with the URL as text
//   underneath for clients that block it;
// - every other paragraph, link and table gets the template's inline styles (email clients ignore
//   <style> blocks often enough that inline is the only reliable way).

export const EMAIL_LOGO_CID = 'northstack-logo';

export const emailLogoAttachment = {
  filename: 'northstack.png',
  content: Buffer.from(EMAIL_LOGO_PNG_BASE64, 'base64'),
  contentType: 'image/png',
  cid: EMAIL_LOGO_CID,
};

const C = {
  page: '#f3f2f8',
  card: '#ffffff',
  line: '#e3e0ee',
  ink: '#1b1733',
  muted: '#58536f',
  faint: '#8a86a0',
  accent: '#5b21e6',
};
const FONT = "'Instrument Sans', Arial, Helvetica, sans-serif";

const P = `margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.ink};`;
const LINK = `color:${C.accent};text-decoration:underline;`;

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function button(href: string, label: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 10px;"><tr>` +
    `<td bgcolor="${C.accent}" style="border-radius:10px;background:${C.accent};">` +
    // style before href on purpose: styleEmailBody's plain-link rule only matches `<a href="`.
    `<a style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;" href="${href}">${label}</a>` +
    `</td></tr></table>` +
    `<p style="margin:0 0 16px;font-family:${FONT};font-size:12px;line-height:1.5;color:${C.faint};word-break:break-all;">${href}</p>`
  );
}

// Styles the body the send*Email functions write (plain <p>, <a>, <table>, <strong>, <img>).
export function styleEmailBody(html: string): string {
  return (
    html
      // <p><a href="…">Label</a></p> → button
      .replace(/<p>\s*<a href="([^"]+)">([^<]+)<\/a>\s*<\/p>/g, (_m, href: string, label: string) => button(href, label))
      .replace(/<p>/g, `<p style="${P}">`)
      .replace(/<a href="/g, `<a style="${LINK}" href="`)
      .replace(/<table(?![^>]*role="presentation")([^>]*)>/g, (_m, attrs: string) =>
        `<table${attrs} style="border-collapse:collapse;margin:0 0 16px;font-family:${FONT};font-size:14px;color:${C.ink};">`)
      .replace(/<blockquote>/g, `<blockquote style="margin:0 0 16px;padding:12px 14px;background:#efe9fe;border-left:3px solid ${C.accent};border-radius:6px;font-family:${FONT};font-size:14px;line-height:1.6;color:${C.ink};">`)
  );
}

const FOOTER: Record<'en' | 'es', string> = {
  en: 'This is an automatic email from Northstack.',
  es: 'Este es un mail automático de Northstack.',
};

export function renderEmailLayout(bodyHtml: string, opts: { subject: string; lng?: string | null }): string {
  const lang: 'en' | 'es' = opts.lng?.toLowerCase().startsWith('es') ? 'es' : 'en';
  const title = escapeAttr(opts.subject);
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
<style>:root{color-scheme:light only;supported-color-schemes:light;}body{margin:0;padding:0;}
@media (max-width:520px){.ns-inner{padding:24px 20px !important;}}</style>
</head>
<body bgcolor="${C.page}" style="margin:0;padding:0;background:${C.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page};">
<tr><td align="center" style="padding:28px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
<tr><td align="center" style="padding:0 0 18px;"><img src="cid:${EMAIL_LOGO_CID}" alt="Northstack" width="213" height="30" style="display:block;border:0;height:30px;width:auto;"></td></tr>
<tr><td bgcolor="${C.card}" class="ns-inner" style="background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:30px 32px;">
<h1 style="margin:0 0 14px;font-family:${FONT};font-size:21px;line-height:1.3;font-weight:700;color:${C.ink};">${title}</h1>
${styleEmailBody(bodyHtml)}
</td></tr>
<tr><td align="center" style="padding:18px 12px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.faint};">${FOOTER[lang]}<br>Northstack · <a href="https://joinnorthstack.com" style="color:${C.faint};">joinnorthstack.com</a></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
