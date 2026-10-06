import { describe, expect, it } from 'vitest';
import { renderEmailLayout, styleEmailBody } from '../src/lib/emailLayout.js';

describe('email template', () => {
  it('turns a paragraph holding only a link into the violet button, with the URL underneath', () => {
    const html = styleEmailBody('<p><a href="https://app.joinnorthstack.com/x">Reset your password</a></p>');
    const anchor = html.match(/<a [^>]*>Reset your password<\/a>/)![0];
    expect(anchor.match(/style="/g)).toHaveLength(1); // one style only: the plain-link rule must not hit it
    expect(anchor).toContain('color:#ffffff');
    expect(html).toContain('bgcolor="#5b21e6"');
    expect(html).toContain('>https://app.joinnorthstack.com/x</p>');
  });

  it('styles plain paragraphs and links inside text, without touching other markup', () => {
    const html = styleEmailBody('<p>Hola <strong>Sofía</strong>, mirá <a href="https://x.y">esto</a>.</p>');
    expect(html).toContain('<p style="margin:0 0 14px;');
    expect(html).toContain('<a style="color:#5b21e6;text-decoration:underline;" href="https://x.y">esto</a>');
    expect(html).toContain('<strong>Sofía</strong>');
  });

  it('is always light, carries the logo and the footer in the email language', () => {
    const es = renderEmailLayout('<p>Hola</p>', { subject: 'Asunto <prueba>', lng: 'es' });
    expect(es).toContain('<meta name="color-scheme" content="light">');
    expect(es).toContain('color-scheme:light only');
    expect(es).toContain('src="cid:northstack-logo"');
    expect(es).toContain('Asunto &lt;prueba&gt;');
    expect(es).toContain('Este es un mail automático de Northstack.');
    expect(renderEmailLayout('<p>Hi</p>', { subject: 'S', lng: null })).toContain('This is an automatic email from Northstack.');
  });
});
