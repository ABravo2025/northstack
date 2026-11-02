import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    opportunity: { findFirst: vi.fn(), update: vi.fn() },
    user: { findFirst: vi.fn() },
    employee: { findFirst: vi.fn() },
    company: { update: vi.fn() },
  },
}));
vi.mock('../src/lib/mailer.js', () => ({ sendClientWelcomeEmail: vi.fn() }));
vi.mock('../src/modules/tasks/taskService.js', () => ({ createTask: vi.fn() }));
vi.mock('../src/modules/projects/projectService.js', () => ({ hasRoomForOpenProject: vi.fn(async () => ({ allowed: true, max: null })) }));
vi.mock('../src/modules/projects/projectTemplateService.js', () => ({ instantiateTemplate: vi.fn(async () => ({ id: 'proj-1' })) }));

import prisma from '../src/lib/prisma.js';
import { sendClientWelcomeEmail } from '../src/lib/mailer.js';
import { createTask } from '../src/modules/tasks/taskService.js';
import { hasRoomForOpenProject } from '../src/modules/projects/projectService.js';
import { instantiateTemplate } from '../src/modules/projects/projectTemplateService.js';
import { performHandoff } from '../src/modules/crm/handoffService.js';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const tenant = { id: 't1', name: 'Atlas', country: 'AR', plan: 'growth' as const, planOverride: null };

const deal = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  companyId: 'co1',
  handoffAt: null,
  stage: { outcome: 'won' },
  company: { name: 'Acme' },
  contactLinks: [{ contactId: 'c1', contact: { id: 'c1', email: 'ana@acme.com', firstName: 'Ana' } }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.opportunity.findFirst.mockResolvedValue(deal());
  db.user.findFirst.mockResolvedValue({ id: 'u-csm', firstName: 'Caro', lastName: 'Gil', email: 'caro@atlas.com' });
  db.employee.findFirst.mockResolvedValue({ id: 'e-csm' });
});

describe('hand-off of a won deal', () => {
  it('sets the account owner, creates the onboarding project, schedules the kickoff and welcomes the contact', async () => {
    const r = await performHandoff(tenant, 'u-actor', 'o1', {
      accountOwnerId: 'u-csm',
      templateId: 'tpl-1',
      kickoffAt: '2026-11-10T15:00:00.000Z',
      welcomeContactId: 'c1',
    });
    expect(r).toEqual({ projectId: 'proj-1', kickoffScheduled: true, welcomeSent: true });
    expect(db.opportunity.findFirst.mock.calls[0][0].where).toEqual({ id: 'o1', tenantId: 't1' });
    expect(instantiateTemplate).toHaveBeenCalledWith(expect.objectContaining({ templateId: 'tpl-1', tenantId: 't1', companyId: 'co1', ownerEmployeeId: 'e-csm' }), 'u-actor');
    expect(db.company.update).toHaveBeenCalledWith({ where: { id: 'co1' }, data: { accountOwnerId: 'u-csm' } });
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'company', entityId: 'co1', assigneeId: 'u-csm', hasVideoCall: true, meetAttendeeEmail: 'ana@acme.com' }));
    expect(sendClientWelcomeEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana@acme.com', ownerName: 'Caro Gil', locale: 'es' }));
    expect(db.opportunity.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: expect.objectContaining({ handoffProjectId: 'proj-1' }) });
  });

  it('only for a won deal, and only once', async () => {
    db.opportunity.findFirst.mockResolvedValueOnce(deal({ stage: { outcome: 'open' } }));
    await expect(performHandoff(tenant, 'u', 'o1', { accountOwnerId: 'u-csm' })).rejects.toMatchObject({ code: 'not_won' });
    db.opportunity.findFirst.mockResolvedValueOnce(deal({ handoffAt: new Date() }));
    await expect(performHandoff(tenant, 'u', 'o1', { accountOwnerId: 'u-csm' })).rejects.toMatchObject({ code: 'already_done' });
  });

  it('refuses an owner or contact of someone else, and respects the open-projects limit', async () => {
    db.user.findFirst.mockResolvedValueOnce(null);
    await expect(performHandoff(tenant, 'u', 'o1', { accountOwnerId: 'u-of-B' })).rejects.toMatchObject({ status: 404 });
    await expect(performHandoff(tenant, 'u', 'o1', { accountOwnerId: 'u-csm', welcomeContactId: 'c-not-on-deal' })).rejects.toMatchObject({ status: 404 });
    vi.mocked(hasRoomForOpenProject).mockResolvedValueOnce({ allowed: false, max: 3 });
    await expect(performHandoff(tenant, 'u', 'o1', { accountOwnerId: 'u-csm', templateId: 'tpl-1' })).rejects.toMatchObject({ code: 'project_limit' });
    expect(db.company.update).not.toHaveBeenCalled();
  });

  it('just the account owner is enough', async () => {
    const r = await performHandoff(tenant, 'u', 'o1', { accountOwnerId: 'u-csm' });
    expect(r).toEqual({ projectId: null, kickoffScheduled: false, welcomeSent: false });
    expect(createTask).not.toHaveBeenCalled();
    expect(sendClientWelcomeEmail).not.toHaveBeenCalled();
  });
});
