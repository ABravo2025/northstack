import { describe, expect, it } from 'vitest';
import { normalizeSocialLinks } from '../src/modules/auth/authService.js';

describe('normalizeSocialLinks', () => {
  it('adds https:// to bare links and drops empty values', () => {
    expect(normalizeSocialLinks({ linkedin: 'linkedin.com/in/ana', x: '  ', website: 'https://ana.dev' })).toEqual({
      ok: true,
      links: { linkedin: 'https://linkedin.com/in/ana', website: 'https://ana.dev/' },
    });
  });

  it('rejects non-http(s) schemes so a stored link can never run script', () => {
    expect(normalizeSocialLinks({ linkedin: 'javascript:alert(1)' })).toEqual({ ok: false, network: 'linkedin' });
    expect(normalizeSocialLinks({ instagram: 'data:text/html,hi' })).toEqual({ ok: false, network: 'instagram' });
  });

  it('rejects things that are not links', () => {
    expect(normalizeSocialLinks({ facebook: 'my name' })).toEqual({ ok: false, network: 'facebook' });
    expect(normalizeSocialLinks({ x: 42 })).toEqual({ ok: false, network: 'x' });
  });

  it('ignores unknown networks', () => {
    expect(normalizeSocialLinks({ myspace: 'https://myspace.com/ana' })).toEqual({ ok: true, links: {} });
  });
});
