import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    form: { findFirst: vi.fn(), findMany: vi.fn() },
    contact: { findMany: vi.fn() },
    employee: { findMany: vi.fn() },
    tenant: { findUnique: vi.fn() },
    user: { findMany: vi.fn() },
    formInvite: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    employeeTermination: { findMany: vi.fn() },
    opportunityStageHistory: { findMany: vi.fn() },
  },
}));
vi.mock('../src/lib/mailer.js', () => ({ sendFormInviteEmail: vi.fn() }));
vi.mock('../src/modules/forms/formResponseService.js', () => ({ submitResponse: vi.fn(async () => ({ responseId: 'r1', linked: null })) }));

import prisma from '../src/lib/prisma.js';
import { sendFormInviteEmail } from '../src/lib/mailer.js';
import { submitResponse } from '../src/modules/forms/formResponseService.js';
import { hashInviteToken } from '../src/lib/formsEncryption.js';
import { runSurveyTriggers, sendInvites, submitInvite } from '../src/modules/forms/formInviteService.js';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
let previousKey: string | undefined;

beforeAll(() => {
  previousKey = process.env.FORMS_DATA_ENCRYPTION_KEY;
  process.env.FORMS_DATA_ENCRYPTION_KEY = '4'.repeat(64);
});
afterAll(() => {
  if (previousKey === undefined) delete process.env.FORMS_DATA_ENCRYPTION_KEY;
  else process.env.FORMS_DATA_ENCRYPTION_KEY = previousKey;
});

const survey = (over: Record<string, unknown> = {}) => ({
  id: 'f1',
  tenantId: 't1',
  name: 'NPS clientes',
  kind: 'survey',
  module: 'clients',
  action: 'save_only',
  status: 'published',
  fields: [{ id: 'q1', label: 'NPS', type: 'rating_nps', required: true }],
  surveySettings: { metric: 'nps', trigger: 'manual' },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.form.findFirst.mockResolvedValue(survey());
  db.contact.findMany.mockResolvedValue([
    { id: 'c1', firstName: 'Ana', lastName: 'Paz', email: 'ana@acme.com' },
    { id: 'c2', firstName: 'Beto', lastName: 'Ruiz', email: 'beto@acme.com' },
  ]);
  db.tenant.findUnique.mockResolvedValue({ name: 'Atlas', country: 'AR' });
  db.user.findMany.mockResolvedValue([]);
  db.formInvite.findMany.mockResolvedValue([]);
  db.formInvite.create.mockResolvedValue({});
});

describe('sendInvites', () => {
  it('emails each recipient a personal link and stores only the token hash', async () => {
    const result = await sendInvites('t1', 'f1', { recipientIds: ['c1', 'c2'] });
    expect(result).toEqual({ sent: 2, skipped: [] });
    const created = db.formInvite.create.mock.calls[0][0].data;
    const email = vi.mocked(sendFormInviteEmail).mock.calls[0][0];
    const token = email.url.split('/f/p/')[1];
    expect(created.tokenHash).toBe(hashInviteToken(token));
    expect(JSON.stringify(created)).not.toContain(token);
    expect(email).toMatchObject({ to: 'ana@acme.com', firstName: 'Ana', isSurvey: true, locale: 'es' });
  });

  it('skips who got the same form in the last 60 days', async () => {
    db.formInvite.findMany.mockResolvedValue([{ recipientId: 'c1' }]);
    const result = await sendInvites('t1', 'f1', { recipientIds: ['c1', 'c2'] });
    expect(result).toEqual({ sent: 1, skipped: [{ id: 'c1', reason: 'recent' }] });
    expect(db.formInvite.findMany.mock.calls[0][0].where.sentAt.gte.getTime()).toBeGreaterThan(Date.now() - 61 * 86_400_000);
  });

  it('refuses a draft, a public form and a form of another tenant', async () => {
    db.form.findFirst.mockResolvedValueOnce(survey({ status: 'draft' }));
    await expect(sendInvites('t1', 'f1', { recipientIds: ['c1'] })).rejects.toMatchObject({ code: 'not_published' });
    db.form.findFirst.mockResolvedValueOnce(survey({ kind: 'form', module: 'leads', action: 'create_lead' }));
    await expect(sendInvites('t1', 'f1', { recipientIds: ['c1'] })).rejects.toMatchObject({ code: 'not_personal' });
    db.form.findFirst.mockResolvedValueOnce(null);
    await expect(sendInvites('t1', 'f-of-other', { recipientIds: ['c1'] })).rejects.toMatchObject({ status: 404 });
    expect(db.form.findFirst).toHaveBeenLastCalledWith({ where: { id: 'f-of-other', tenantId: 't1' } });
  });
});

describe('submitInvite', () => {
  const invite = (over: Record<string, unknown> = {}) => ({
    id: 'i1',
    tenantId: 't1',
    recipientType: 'contact',
    recipientId: 'c1',
    respondedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    form: survey(),
    tenant: { plan: 'growth', planOverride: null },
    ...over,
  });
  const token = 'a'.repeat(43);

  it('answers once, as the invited person', async () => {
    db.formInvite.findUnique.mockResolvedValue(invite());
    db.formInvite.updateMany.mockResolvedValue({ count: 1 });
    await submitInvite(token, { q1: 9 });
    expect(submitResponse).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }), { q1: 9 }, { source: 'personal_link', respondent: { type: 'contact', id: 'c1' } });
    expect(db.formInvite.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { responseId: 'r1' } });
  });

  it('never ties an anonymous answer to its link, not even by time', async () => {
    db.formInvite.findUnique.mockResolvedValue(invite({ recipientType: 'employee', recipientId: 'e1', form: survey({ module: 'employees', surveySettings: { anonymous: true } }) }));
    db.employee.findMany.mockResolvedValue([{ id: 'e1', firstName: 'Ana', lastName: 'Paz' }]);
    db.formInvite.updateMany.mockResolvedValue({ count: 1 });
    await submitInvite(token, { q1: 9 });
    const respondedAt = db.formInvite.updateMany.mock.calls[0][0].data.respondedAt as Date;
    expect(respondedAt.toISOString()).toMatch(/T00:00:00\.000Z$/);
    expect(db.formInvite.update).not.toHaveBeenCalled();
  });

  it('refuses an answered or expired link, and a race lost to another tab', async () => {
    db.formInvite.findUnique.mockResolvedValueOnce(invite({ respondedAt: new Date() }));
    await expect(submitInvite(token, {})).rejects.toMatchObject({ code: 'already_answered' });
    db.formInvite.findUnique.mockResolvedValueOnce(invite({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(submitInvite(token, {})).rejects.toMatchObject({ code: 'expired' });
    db.formInvite.findUnique.mockResolvedValueOnce(invite());
    db.formInvite.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(submitInvite(token, {})).rejects.toMatchObject({ code: 'already_answered' });
    expect(submitResponse).not.toHaveBeenCalled();
  });

  it('frees the link again when the answer is invalid', async () => {
    db.formInvite.findUnique.mockResolvedValue(invite());
    db.formInvite.updateMany.mockResolvedValue({ count: 1 });
    vi.mocked(submitResponse).mockRejectedValueOnce(new Error('invalid'));
    await expect(submitInvite(token, {})).rejects.toThrow('invalid');
    expect(db.formInvite.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { respondedAt: null } });
  });

  it('ignores a malformed token without touching the database', async () => {
    await expect(submitInvite('../../etc', {})).rejects.toMatchObject({ status: 404 });
    expect(db.formInvite.findUnique).not.toHaveBeenCalled();
  });
});

describe('runSurveyTriggers', () => {
  it('sends the 30-days-after-hire survey to whoever started 30 days ago', async () => {
    const form = survey({ module: 'employees', action: 'save_to_file', surveySettings: { metric: 'enps', trigger: '30_days_after_hire', anonymous: true }, tenant: { plan: 'growth', planOverride: null } });
    db.form.findMany.mockResolvedValue([form]);
    db.form.findFirst.mockResolvedValue(form);
    db.employee.findMany.mockResolvedValue([{ id: 'e1', firstName: 'Caro', lastName: 'Gil', email: 'caro@atlas.com' }]);
    const result = await runSurveyTriggers('2026-11-02');
    expect(result).toEqual({ forms: 1, sent: 1 });
    const where = db.employee.findMany.mock.calls[0][0].where;
    expect(where.startDate.gte.toISOString().slice(0, 10)).toBe('2026-10-03');
    expect(vi.mocked(sendFormInviteEmail).mock.calls[0][0]).toMatchObject({ anonymous: true });
  });

  it('only sends the quarterly survey on the first day of a quarter', async () => {
    const form = survey({ module: 'employees', action: 'save_to_file', surveySettings: { trigger: 'quarterly' }, tenant: { plan: 'growth', planOverride: null } });
    db.form.findMany.mockResolvedValue([form]);
    expect(await runSurveyTriggers('2026-11-02')).toEqual({ forms: 0, sent: 0 });
    expect(db.employee.findMany).not.toHaveBeenCalled();
  });

  it('skips companies on Starter', async () => {
    db.form.findMany.mockResolvedValue([survey({ surveySettings: { trigger: 'every_90_days' }, tenant: { plan: 'starter', planOverride: null } })]);
    expect(await runSurveyTriggers('2026-11-02')).toEqual({ forms: 0, sent: 0 });
  });
});
