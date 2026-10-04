import { describe, expect, it } from 'vitest';
import type { PlatformAnnouncement } from '@prisma/client';
import { isForAudience, localizeAnnouncement } from '../src/modules/notifications/platformAnnouncementService.js';
import { parseAnnouncement } from '../src/modules/platform/adminAnnouncementService.js';

const base: PlatformAnnouncement = {
  id: 'a1', type: 'feature_update', title: 'New reports', summary: 'Reports are here', body: 'Long text', policyType: null,
  publishedAt: new Date('2026-10-01'), createdAt: new Date('2026-10-01'),
  titleEs: null, summaryEs: null, bodyEs: null, targetPlans: [], targetCountries: [], targetTenantIds: [], createdByUserId: null,
};

describe('isForAudience', () => {
  const ar = { tenantId: 't1', plan: 'starter', country: 'Argentina' };
  it('empty targets = everyone', () => {
    expect(isForAudience(base, ar)).toBe(true);
  });
  it('every non-empty dimension must match (plan "trial" = no plan)', () => {
    expect(isForAudience({ ...base, targetPlans: ['growth'] }, ar)).toBe(false);
    expect(isForAudience({ ...base, targetPlans: ['trial'] }, { ...ar, plan: null })).toBe(true);
    expect(isForAudience({ ...base, targetCountries: ['argentina'] }, ar)).toBe(true);
    expect(isForAudience({ ...base, targetCountries: ['Spain'] }, ar)).toBe(false);
    expect(isForAudience({ ...base, targetPlans: ['starter'], targetCountries: ['Spain'] }, ar)).toBe(false);
    expect(isForAudience({ ...base, targetTenantIds: ['t2'] }, ar)).toBe(false);
    expect(isForAudience({ ...base, targetTenantIds: ['t1', 't2'] }, ar)).toBe(true);
  });
});

describe('localizeAnnouncement', () => {
  const both = { ...base, titleEs: 'Reportes nuevos', summaryEs: 'Llegaron los reportes', bodyEs: 'Texto largo' };
  it('shows the Spanish version to Spanish users when there is one', () => {
    expect(localizeAnnouncement(both, 'es').title).toBe('Reportes nuevos');
    expect(localizeAnnouncement(both, 'es-AR').summary).toBe('Llegaron los reportes');
    expect(localizeAnnouncement(both, 'en').title).toBe('New reports');
    expect(localizeAnnouncement(base, 'es').title).toBe('New reports');
  });
});

describe('parseAnnouncement', () => {
  const now = new Date('2026-10-04T12:00:00Z');
  const ok = { title: 'T', summary: 'S', body: 'B' };
  it('requires the English text and a Spanish title when Spanish text is given', () => {
    expect(parseAnnouncement({ title: 'T', summary: '', body: 'B' }, now).ok).toBe(false);
    expect(parseAnnouncement({ ...ok, bodyEs: 'Texto' }, now).ok).toBe(false);
    expect(parseAnnouncement({ ...ok, titleEs: 'Título', bodyEs: 'Texto' }, now).ok).toBe(true);
  });
  it('schedules future dates, but never a policy change', () => {
    const r = parseAnnouncement({ ...ok, publishAt: '2026-10-10T09:00:00Z' }, now);
    expect(r.ok && (r.data.publishedAt as Date).toISOString()).toBe('2026-10-10T09:00:00.000Z');
    expect(parseAnnouncement({ ...ok, type: 'policy_change', policyType: 'privacy_policy', publishAt: '2026-10-10T09:00:00Z' }, now).ok).toBe(false);
    expect(parseAnnouncement({ ...ok, type: 'policy_change' }, now).ok).toBe(false);
  });
  it('keeps only known plans and drops duplicates', () => {
    const r = parseAnnouncement({ ...ok, targetPlans: ['growth', 'growth', 'enterprise'], targetCountries: [' Spain ', ''] }, now);
    expect(r.ok && r.data.targetPlans).toEqual(['growth']);
    expect(r.ok && r.data.targetCountries).toEqual(['Spain']);
  });
});
