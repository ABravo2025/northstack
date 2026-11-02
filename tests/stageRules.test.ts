import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    pipelineStageDefinition: { findUnique: vi.fn(), findFirst: vi.fn() },
    opportunity: { findFirst: vi.fn(), update: vi.fn() },
    opportunityContact: { findMany: vi.fn() },
  },
}));
vi.mock('../src/modules/tasks/taskService.js', () => ({ createTask: vi.fn() }));
vi.mock('../src/modules/forms/formInviteService.js', () => ({ sendInvites: vi.fn() }));

import prisma from '../src/lib/prisma.js';
import { createTask } from '../src/modules/tasks/taskService.js';
import { sendInvites } from '../src/modules/forms/formInviteService.js';
import { buildTemplate, isForwardMove, missingRequired, sanitizeAutomations, sanitizeChecklist } from '../src/modules/crm/stageRules.js';
import {
  OpportunityChecklistError,
  assertChecklistAllowsMove,
  runEnterAutomations,
  setChecklistItem,
} from '../src/modules/crm/stageAutomationService.js';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
beforeEach(() => vi.clearAllMocks());

describe('stage rules', () => {
  it('cleans checklists and automations, rejecting unknown automation types', () => {
    const checklist = sanitizeChecklist([{ label: '  Propuesta enviada ' }, { label: '', required: true }, { id: 'x1', label: 'Opcional', required: false }])!;
    expect(checklist.map((i) => [i.label, i.required])).toEqual([
      ['Propuesta enviada', true],
      ['Opcional', false],
    ]);
    expect(sanitizeAutomations([{ type: 'create_task', title: 'Llamar', dueInDays: 900 }])![0]).toMatchObject({ title: 'Llamar', dueInDays: 0 });
    expect(sanitizeAutomations([{ type: 'delete_everything' }])).toBeNull();
    expect(sanitizeChecklist('nope')).toBeNull();
  });

  it('only a move forward (later open stage, or won) can be blocked; back and lost never', () => {
    const at = (order: number, outcome: 'open' | 'won' | 'lost' = 'open') => ({ order, outcome });
    expect(isForwardMove(at(1), at(2))).toBe(true);
    expect(isForwardMove(at(2), at(1))).toBe(false);
    expect(isForwardMove(at(2), at(9, 'won'))).toBe(true);
    expect(isForwardMove(at(2), at(10, 'lost'))).toBe(false);
  });

  it('lists the required items not ticked yet', () => {
    const list = [
      { id: 'a', label: 'A', required: true },
      { id: 'b', label: 'B', required: false },
      { id: 'c', label: 'C', required: true },
    ];
    expect(missingRequired(list, ['a']).map((i) => i.id)).toEqual(['c']);
  });

  it('builds the three templates in the company language, with won and lost stages', () => {
    const es = buildTemplate('renewal', 'es');
    expect(es).toMatchObject({ name: 'Renovaciones', type: 'account', purpose: 'renewal' });
    expect(es.stages.filter((s) => s.outcome === 'won')).toHaveLength(1);
    expect(es.stages.filter((s) => s.outcome === 'lost')).toHaveLength(1);
    expect(buildTemplate('new_business', 'en').stages[0].exitChecklist.map((i) => i.label)).toContain('Need confirmed');
  });
});

describe('checklist gate', () => {
  const stage = (id: string, order: number, outcome = 'open', exitChecklist: unknown = null) => ({ id, pipelineId: 'p1', order, outcome, exitChecklist });

  it('blocks a forward move while required items are missing, naming them', async () => {
    db.pipelineStageDefinition.findUnique.mockImplementation(async ({ where }) =>
      where.id === 's1' ? stage('s1', 1, 'open', [{ id: 'i1', label: 'Propuesta enviada', required: true }]) : stage('s2', 2),
    );
    await expect(assertChecklistAllowsMove({ stageId: 's1', checklistState: null }, 's2')).rejects.toBeInstanceOf(OpportunityChecklistError);
    await expect(assertChecklistAllowsMove({ stageId: 's1', checklistState: { s1: ['i1'] } }, 's2')).resolves.toBeUndefined();
  });

  it('never blocks closing as lost', async () => {
    db.pipelineStageDefinition.findUnique.mockImplementation(async ({ where }) =>
      where.id === 's1' ? stage('s1', 1, 'open', [{ id: 'i1', label: 'X', required: true }]) : stage('lost', 9, 'lost'),
    );
    await expect(assertChecklistAllowsMove({ stageId: 's1', checklistState: null }, 'lost')).resolves.toBeUndefined();
  });

  it('ticks an item only if it exists on that stage of the deal’s own pipeline and tenant', async () => {
    db.opportunity.findFirst.mockResolvedValue({ id: 'o1', pipelineId: 'p1', checklistState: { s1: ['a'] } });
    db.pipelineStageDefinition.findFirst.mockResolvedValue(stage('s1', 1, 'open', [{ id: 'a', label: 'A', required: true }, { id: 'b', label: 'B', required: true }]));
    db.opportunity.update.mockImplementation(async ({ data }) => data);
    expect(await setChecklistItem('t1', 'o1', 's1', 'b', true)).toEqual({ checklistState: { s1: ['a', 'b'] } });
    expect(db.opportunity.findFirst).toHaveBeenCalledWith({ where: { id: 'o1', tenantId: 't1' } });
    expect(await setChecklistItem('t1', 'o1', 's1', 'ghost', true)).toBeNull();
  });
});

describe('entry automations', () => {
  it('creates the task for the owner and sends the survey to the deal’s contacts', async () => {
    db.opportunityContact.findMany.mockResolvedValue([{ contactId: 'c1' }, { contactId: 'c2' }]);
    await runEnterAutomations(
      't1',
      { id: 'o1', name: 'Acme', ownerId: 'u-owner' },
      { enterAutomations: [{ id: 'a1', type: 'create_task', title: 'Enviar propuesta', dueInDays: 2 }, { id: 'a2', type: 'send_survey', formId: 'f1' }] },
      'u-actor',
    );
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', entityType: 'opportunity', entityId: 'o1', assigneeId: 'u-owner', createdById: 'u-actor', title: 'Enviar propuesta' }));
    expect(sendInvites).toHaveBeenCalledWith('t1', 'f1', expect.objectContaining({ recipientIds: ['c1', 'c2'], trigger: 'stage_entered' }));
  });

  it('a failing automation never breaks the move', async () => {
    vi.mocked(createTask).mockRejectedValueOnce(new Error('calendar down'));
    await expect(runEnterAutomations('t1', { id: 'o1', name: 'Acme', ownerId: 'u1' }, { enterAutomations: [{ id: 'a1', type: 'create_task', title: 'X', dueInDays: 0 }] })).resolves.toBeUndefined();
  });
});
