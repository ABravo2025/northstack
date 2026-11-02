import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MIN_FILL_MS,
  checkStamp,
  escapeHtml,
  frameAncestors,
  pageCsp,
  pickLang,
  renderFormPage,
  renderStamp,
} from '../src/modules/forms/publicFormPage.js';
import { EMBED_SCRIPT } from '../src/modules/forms/embedScript.js';

let previousKey: string | undefined;
beforeAll(() => {
  previousKey = process.env.FORMS_DATA_ENCRYPTION_KEY;
  process.env.FORMS_DATA_ENCRYPTION_KEY = '2'.repeat(64);
});
afterAll(() => {
  if (previousKey === undefined) delete process.env.FORMS_DATA_ENCRYPTION_KEY;
  else process.env.FORMS_DATA_ENCRYPTION_KEY = previousKey;
});

const page = (over: Partial<Parameters<typeof renderFormPage>[0]> = {}) =>
  renderFormPage({
    nonce: 'abc123',
    lang: 'es',
    key: 'acme/demo',
    name: 'Pedí una demo',
    description: null,
    questions: [{ id: 'q1', label: 'Email', type: 'email', required: true, mapTo: 'contact.email' }],
    logoUrl: null,
    action: '/api/public/forms/acme/demo',
    stamp: 'x',
    utm: {},
    ...over,
  });

describe('public form page', () => {
  it('escapes every piece of tenant text, including inside the inline config', () => {
    const html = page({
      name: '<img src=x onerror=alert(1)>',
      description: '"><script>alert(2)</script>',
      questions: [{ id: 'q1', label: '<b>hola</b>', type: 'select', required: true, options: ['</script><script>alert(3)</script>', 'B'], mapTo: null }],
      utm: { source: '</script><script>alert(4)</script>' },
    });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;b&gt;hola&lt;/b&gt;');
    expect(escapeHtml(`a&<>"'`)).toBe('a&amp;&lt;&gt;&quot;&#39;');
  });

  it('runs its script and style only under the nonce, and posts nowhere but its own origin', () => {
    const csp = pageCsp('abc123', []);
    expect(csp).toContain("script-src 'nonce-abc123'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(page()).toContain('<script nonce="abc123">');
  });

  it('limits embedding to the allowed domains', () => {
    expect(frameAncestors(['acme.com', '*.acme.com.ar'])).toBe("frame-ancestors 'self' https://acme.com https://*.acme.com.ar");
    expect(frameAncestors([])).toBe("frame-ancestors 'self' https:");
  });

  it('has a honeypot field kept out of sight and of the tab order', () => {
    expect(page()).toMatch(/<input id="hp" name="website" type="text" tabindex="-1"/);
  });

  it('picks the language from the browser, then the company country', () => {
    expect(pickLang('es-AR,es;q=0.9', null)).toBe('es');
    expect(pickLang('en-US', 'AR')).toBe('en');
    expect(pickLang(undefined, 'AR')).toBe('es');
    expect(pickLang('fr-FR', 'US')).toBe('en');
  });
});

describe('render stamp (anti-spam)', () => {
  it('accepts a stamp after the minimum fill time and refuses one posted too fast', () => {
    const now = 1_800_000_000_000;
    const stamp = renderStamp('f1', now);
    expect(checkStamp('f1', stamp, now + 500)).toBe('too_fast');
    expect(checkStamp('f1', stamp, now + MIN_FILL_MS + 1)).toBe('ok');
  });

  it('refuses a forged, expired or other-form stamp', () => {
    const now = 1_800_000_000_000;
    const stamp = renderStamp('f1', now);
    expect(checkStamp('f2', stamp, now + 10_000)).toBe('invalid');
    expect(checkStamp('f1', `${now}.forged`, now + 10_000)).toBe('invalid');
    expect(checkStamp('f1', stamp, now + 25 * 60 * 60 * 1000)).toBe('invalid');
    expect(checkStamp('f1', undefined, now)).toBe('invalid');
  });
});

describe('embed.js', () => {
  it('only trusts messages from Northstack’s own origin and only follows https redirects', () => {
    expect(EMBED_SCRIPT).toContain('e.origin !== origin');
    expect(EMBED_SCRIPT).toContain('/^https:\\/\\//.test(e.data.url)');
    expect(EMBED_SCRIPT).toContain("/^[a-z0-9-]+\\/[a-z0-9-]+$/");
  });
});
