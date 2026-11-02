import { describe, expect, it } from 'vitest';
import { actionsFor, normalizeAnswers, sanitizeQuestions, scoreOf, validateDefinition, type FormQuestion } from '../src/modules/forms/formDefinitions.js';
import { normalizeSlug, sanitizeDomains } from '../src/modules/forms/formService.js';

const refs = { customFields: new Map([['cf-contact', { entityType: 'contact', fieldType: 'text', options: [] }]]) };
const q = (over: Partial<FormQuestion>): FormQuestion => ({ id: 'q1', label: 'Email', type: 'email', required: true, mapTo: null, ...over });
const leadQuestions = [q({ id: 'q1', type: 'email', mapTo: 'contact.email' }), q({ id: 'q2', label: 'Nombre', type: 'short_text', mapTo: 'contact.firstName' })];

describe('form definitions', () => {
  it('offers each module its own actions; surveys only for clients, employees and leads', () => {
    expect(actionsFor('form', 'clients')).toEqual(['update_contact', 'add_contact']);
    expect(actionsFor('survey', 'employees')).toEqual(['save_to_file']);
    expect(actionsFor('survey', 'projects')).toEqual([]);
  });

  it('accepts a lead form with email and name mapped', () => {
    expect(validateDefinition({ kind: 'form', module: 'leads', action: 'create_lead', fields: leadQuestions }, refs)).toBeNull();
  });

  it('rejects an action of another module, a missing required target and a mismatched type', () => {
    expect(validateDefinition({ kind: 'form', module: 'leads', action: 'create_task', fields: leadQuestions }, refs)).toBe('invalid_action');
    expect(validateDefinition({ kind: 'form', module: 'leads', action: 'create_lead', fields: [leadQuestions[1]] }, refs)).toBe('missing_required_target');
    expect(
      validateDefinition({ kind: 'form', module: 'leads', action: 'create_lead', fields: [q({ type: 'short_text', mapTo: 'contact.email' }), leadQuestions[1]] }, refs),
    ).toBe('target_type_mismatch');
  });

  it('only maps custom fields of this tenant and of the action’s entity', () => {
    const withCf = (id: string) => [...leadQuestions, q({ id: 'q3', type: 'short_text', mapTo: `cf:${id}` })];
    expect(validateDefinition({ kind: 'form', module: 'leads', action: 'create_lead', fields: withCf('cf-contact') }, refs)).toBeNull();
    expect(validateDefinition({ kind: 'form', module: 'leads', action: 'create_lead', fields: withCf('cf-of-other-tenant') }, refs)).toBe('invalid_target');
    expect(validateDefinition({ kind: 'form', module: 'projects', action: 'create_task', fields: [q({ type: 'short_text', mapTo: 'task.title' }), q({ id: 'q3', type: 'short_text', mapTo: 'cf:cf-contact' })] }, refs)).toBe('invalid_target');
  });

  it('a survey needs a rating question', () => {
    const fields = [q({ type: 'long_text', label: '¿Qué mejorarías?', required: false })];
    expect(validateDefinition({ kind: 'survey', module: 'clients', action: 'save_only', fields }, refs)).toBe('survey_needs_rating');
    expect(validateDefinition({ kind: 'survey', module: 'clients', action: 'save_only', fields: [...fields, q({ id: 'q2', type: 'rating_nps', label: 'NPS' })] }, refs)).toBeNull();
  });

  it('sanitizes questions from a request and rejects junk', () => {
    expect(sanitizeQuestions('nope')).toBeNull();
    const [clean] = sanitizeQuestions([{ id: 'q1', label: '  Hola ', type: 'select', options: [' A', '', 'B', 3], required: 'yes', extra: 1 }])!;
    expect(clean).toEqual({ id: 'q1', label: 'Hola', type: 'select', required: false, options: ['A', 'B'], mapTo: null });
  });
});

describe('answers', () => {
  const questions: FormQuestion[] = [
    q({ id: 'email' }),
    q({ id: 'nps', type: 'rating_nps', label: 'NPS' }),
    q({ id: 'plan', type: 'select', options: ['Starter', 'Growth'], required: false }),
    q({ id: 'extras', type: 'multi_select', options: ['A', 'B'], required: false }),
  ];

  it('normalizes valid answers and drops unknown keys', () => {
    const r = normalizeAnswers(questions, { email: ' Ana@X.com ', nps: '9', plan: 'Growth', extras: ['A', 'A'], hacker: 'x' });
    expect(r).toEqual({ ok: true, answers: { email: 'ana@x.com', nps: 9, plan: 'Growth', extras: ['A'] } });
    expect(scoreOf(questions, (r as { answers: Record<string, unknown> }).answers)).toBe(9);
  });

  it('points at the first invalid or missing answer', () => {
    expect(normalizeAnswers(questions, { nps: 9 })).toEqual({ ok: false, questionId: 'email' });
    expect(normalizeAnswers(questions, { email: 'a@b.co', nps: 11 })).toEqual({ ok: false, questionId: 'nps' });
    expect(normalizeAnswers(questions, { email: 'a@b.co', nps: 5, plan: 'Enterprise' })).toEqual({ ok: false, questionId: 'plan' });
  });
});

describe('slugs and embed domains', () => {
  it('builds a URL-safe slug', () => {
    expect(normalizeSlug('  Encuesta de Satisfacción 2026! ')).toBe('encuesta-de-satisfaccion-2026');
  });

  it('keeps only hostnames for frame-ancestors', () => {
    expect(sanitizeDomains(['https://www.acme.com/contacto', '*.acme.com.ar', 'javascript:alert(1)', "acme.com; script-src *", 42])).toEqual([
      'www.acme.com',
      '*.acme.com.ar',
    ]);
  });
});
