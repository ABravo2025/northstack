import prisma from '../../lib/prisma.js';
import { bestEffort } from '../../lib/bestEffort.js';
import { createNotification } from '../notifications/notificationService.js';

// Task chat (2026-10-06, Alejandro) — a short conversation on any task, with @mentions of anyone in
// the tenant who has a login (on the project or not). A mention sends that person an in-app
// task_mention notification; no email (notification emails are meant to become opt-in first, see
// the notification-preferences backlog item).

export const MAX_COMMENT_LENGTH = 2000;
const SNIPPET_LENGTH = 80;

const commentInclude = {
  author: { select: { id: true, firstName: true, lastName: true } },
} as const;

export async function listTaskComments(taskId: string) {
  return prisma.taskComment.findMany({ where: { taskId }, include: commentInclude, orderBy: { createdAt: 'asc' } });
}

export async function findTaskCommentById(id: string) {
  return prisma.taskComment.findUnique({ where: { id } });
}

// Keeps only real, distinct, active users of this tenant — the client's list is never trusted.
export async function resolveMentionedUserIds(tenantId: string, raw: unknown): Promise<string[]> {
  if (!Array.isArray(raw)) return [];
  const ids = [...new Set(raw.filter((x): x is string => typeof x === 'string'))].slice(0, 20);
  if (ids.length === 0) return [];
  const users = await prisma.user.findMany({ where: { tenantId, id: { in: ids }, status: 'active' }, select: { id: true } });
  return users.map((u) => u.id);
}

function mentionMessage(locale: string | null, authorName: string, taskTitle: string, body: string): string {
  const snippet = body.length > SNIPPET_LENGTH ? `${body.slice(0, SNIPPET_LENGTH - 1)}…` : body;
  return locale === 'es'
    ? `${authorName} te mencionó en "${taskTitle}": ${snippet}`
    : `${authorName} mentioned you in "${taskTitle}": ${snippet}`;
}

export async function createTaskComment(input: {
  tenantId: string;
  task: { id: string; title: string };
  authorId: string;
  body: string;
  mentionedUserIds: string[];
}) {
  const comment = await prisma.taskComment.create({
    data: {
      tenantId: input.tenantId,
      taskId: input.task.id,
      authorId: input.authorId,
      body: input.body,
      mentionedUserIds: input.mentionedUserIds,
    },
    include: commentInclude,
  });

  // Nobody gets notified about their own message.
  const recipientIds = input.mentionedUserIds.filter((id) => id !== input.authorId);
  if (recipientIds.length > 0) {
    const recipients = await prisma.user.findMany({ where: { id: { in: recipientIds } }, select: { id: true, locale: true } });
    const authorName = `${comment.author.firstName} ${comment.author.lastName}`;
    for (const recipient of recipients) {
      await bestEffort(
        createNotification({
          tenantId: input.tenantId,
          userId: recipient.id,
          type: 'task_mention',
          entityType: 'task',
          entityId: input.task.id,
          message: mentionMessage(recipient.locale, authorName, input.task.title, input.body),
        }),
        'Failed to create task_mention notification',
      );
    }
  }
  return comment;
}

export async function deleteTaskComment(id: string) {
  await prisma.taskComment.delete({ where: { id } });
}
