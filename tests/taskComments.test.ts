import { beforeEach, describe, expect, it, vi } from 'vitest';

const { userFindMany, commentCreate, notificationCreate } = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  commentCreate: vi.fn(),
  notificationCreate: vi.fn(),
}));

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    user: { findMany: userFindMany },
    taskComment: { create: commentCreate },
    notification: { create: notificationCreate },
  },
}));

import { createTaskComment, resolveMentionedUserIds } from '../src/modules/tasks/taskCommentService.js';

beforeEach(() => {
  userFindMany.mockReset();
  commentCreate.mockReset();
  notificationCreate.mockReset();
});

describe('resolveMentionedUserIds', () => {
  it("keeps only distinct ids of this tenant's active users", async () => {
    userFindMany.mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }]);
    expect(await resolveMentionedUserIds('t1', ['u1', 'u1', 'u2', 'u-other', 42])).toEqual(['u1', 'u2']);
    expect(userFindMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', id: { in: ['u1', 'u2', 'u-other'] }, status: 'active' });
  });

  it('ignores anything that is not a list, without querying', async () => {
    expect(await resolveMentionedUserIds('t1', 'u1')).toEqual([]);
    expect(await resolveMentionedUserIds('t1', [])).toEqual([]);
    expect(userFindMany).not.toHaveBeenCalled();
  });
});

describe('createTaskComment', () => {
  it('notifies each mentioned person in their language, never the author', async () => {
    commentCreate.mockResolvedValueOnce({ id: 'c1', author: { id: 'author', firstName: 'Ana', lastName: 'Ruiz' } });
    userFindMany.mockResolvedValueOnce([
      { id: 'u-es', locale: 'es' },
      { id: 'u-en', locale: null },
    ]);

    await createTaskComment({
      tenantId: 't1',
      task: { id: 'task-1', title: 'Conciliar bancos' },
      authorId: 'author',
      body: '@Tomás revisá el extracto de septiembre',
      mentionedUserIds: ['u-es', 'u-en', 'author'],
    });

    expect(userFindMany.mock.calls[0][0].where).toEqual({ id: { in: ['u-es', 'u-en'] } });
    const messages = notificationCreate.mock.calls.map((c) => c[0].data);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ userId: 'u-es', type: 'task_mention', entityType: 'task', entityId: 'task-1' });
    expect(messages[0].message).toBe('Ana Ruiz te mencionó en "Conciliar bancos": @Tomás revisá el extracto de septiembre');
    expect(messages[1].message).toMatch(/^Ana Ruiz mentioned you in "Conciliar bancos"/);
  });

  it('sends nothing when nobody (other than the author) is mentioned', async () => {
    commentCreate.mockResolvedValueOnce({ id: 'c1', author: { id: 'author', firstName: 'Ana', lastName: 'Ruiz' } });
    await createTaskComment({ tenantId: 't1', task: { id: 'task-1', title: 'X' }, authorId: 'author', body: 'hola', mentionedUserIds: ['author'] });
    expect(userFindMany).not.toHaveBeenCalled();
    expect(notificationCreate).not.toHaveBeenCalled();
  });
});
