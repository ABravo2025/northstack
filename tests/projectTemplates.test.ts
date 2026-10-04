import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({ default: {} }));

import { resolveTemplateAssignee, resolveTemplateLocale } from '../src/modules/projects/projectTemplateService.js';
import { SYSTEM_TEMPLATES } from '../src/modules/projects/systemTemplates.js';

describe('resolveTemplateAssignee', () => {
  const candidates = {
    userIdByRole: new Map<string, string | null>([
      ['contador', 'user-tomas'],
      ['asistente', null], // on the team, but has no login
    ]),
    ownerUserId: 'user-owner',
    creatorUserId: 'user-creator',
  };

  it('gives the task to the team member holding that role, ignoring case and spaces', () => {
    expect(resolveTemplateAssignee('  Contador ', candidates)).toEqual({ userId: 'user-tomas', fallback: false });
  });

  it('falls back to the owner when the role is unfilled or its person has no login', () => {
    expect(resolveTemplateAssignee('Asistente', candidates)).toEqual({ userId: 'user-owner', fallback: true });
    expect(resolveTemplateAssignee('Socio', candidates)).toEqual({ userId: 'user-owner', fallback: true });
  });

  it('a task with no role goes to the owner without being flagged as a fallback', () => {
    expect(resolveTemplateAssignee(null, candidates)).toEqual({ userId: 'user-owner', fallback: false });
  });

  it('falls back to the creator when the owner has no login either', () => {
    expect(resolveTemplateAssignee('Socio', { ...candidates, ownerUserId: null })).toEqual({ userId: 'user-creator', fallback: true });
  });
});

describe('resolveTemplateLocale', () => {
  it('serves Spanish only when asked, English otherwise', () => {
    expect(resolveTemplateLocale('es')).toBe('es');
    expect(resolveTemplateLocale('en')).toBe('en');
    expect(resolveTemplateLocale('fr')).toBe('en');
    expect(resolveTemplateLocale(undefined)).toBe('en');
  });
});

describe('system template content', () => {
  it('has 9 templates with unique keys across the 4 launch niches', () => {
    expect(SYSTEM_TEMPLATES).toHaveLength(9);
    expect(new Set(SYSTEM_TEMPLATES.map((t) => t.key)).size).toBe(9);
    expect(new Set(SYSTEM_TEMPLATES.map((t) => t.niche))).toEqual(new Set(['agency', 'accounting', 'consulting', 'internal']));
  });

  it.each(SYSTEM_TEMPLATES.map((t) => [t.key, t] as const))('%s is complete in both languages', (_key, t) => {
    const texts = [t.name, t.description, ...t.phases.map((p) => p.name), ...t.phases.flatMap((p) => p.tasks.flatMap((x) => [x.title, ...(x.role ? [x.role] : [])]))];
    for (const text of texts) {
      expect(text.en.trim()).not.toBe('');
      expect(text.es.trim()).not.toBe('');
    }
    const taskCount = t.phases.reduce((n, p) => n + p.tasks.length, 0);
    expect(taskCount).toBeGreaterThanOrEqual(8);
    expect(taskCount).toBeLessThanOrEqual(20);
    for (const p of t.phases) for (const x of p.tasks) expect(Number.isInteger(x.offset)).toBe(true);
  });
});
