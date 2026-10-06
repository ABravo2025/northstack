import prisma from '../lib/prisma.js';
import {
  createTask,
  deleteTask,
  findEntityTenantId,
  findTaskById,
  isSupportedTaskEntityType,
  listMyTasks,
  listTasksForCalendar,
  listTasksForEntity,
  listTasksForUser,
  updateTask,
} from '../modules/tasks/taskService.js';
import { findTaskFolderById } from '../modules/tasks/taskFolderService.js';
import { findPhaseById } from '../modules/projects/projectService.js';
import {
  MAX_COMMENT_LENGTH,
  createTaskComment,
  deleteTaskComment,
  findTaskCommentById,
  listTaskComments,
  resolveMentionedUserIds,
} from '../modules/tasks/taskCommentService.js';
import { findUserById } from '../modules/tenant/tenantService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const tasksRouter = createAsyncRouter();

// The Meet invite email typed on a task (2026-10-06). '' / null clear it. A project task's call
// needs one — a project has no natural person to invite, unlike a Contact or a Company.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function parseMeetEmail(raw: unknown): string | null | undefined | 'invalid' {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string') return 'invalid';
  const email = raw.trim().toLowerCase();
  return EMAIL_RE.test(email) && email.length <= 254 ? email : 'invalid';
}

// A task's phase must be one of the phases of the very project the task belongs to (Projects
// module) — a phase id from another project, or on a non-project task, is rejected.
async function isPhaseOfProject(phaseId: unknown, entityType: string, entityId: string): Promise<boolean> {
  if (typeof phaseId !== 'string' || entityType !== 'project') return false;
  const phase = await findPhaseById(phaseId);
  return phase?.projectId === entityId;
}

// Permissions: deliberately open to any authenticated tenant member (not
// gated behind canCreateHr like Employees/Opportunities) — confirmed with the
// user 2026-07-29. Tasks read more like a shared operational checklist than
// sensitive HR/CRM data, and "My tasks" needs a member to be able to complete
// tasks assigned to them regardless of role. Revisit once custom roles exist
// (see docs/tareas-desarrollo.md backlog note added the same day).

tasksRouter.get('/api/tasks/mine', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  // `scope=hub` is the My Tasks page (assignee OR creator, completed/folder/search filters) —
  // omitted, this stays byte-for-byte the original assignee-only/pending-only response the
  // Overview "My tasks" widget already depends on.
  if (req.query.scope !== 'hub') {
    const tasks = await listMyTasks(user.tenantId!, user.id);
    return res.json(tasks);
  }

  const folderIdParam = req.query.folderId as string | undefined;
  const tasks = await listTasksForUser(user.tenantId!, user.id, {
    includeCompleted: req.query.includeCompleted === 'true',
    folderId: folderIdParam === undefined ? undefined : folderIdParam === 'none' ? null : folderIdParam,
    search: (req.query.search as string | undefined) || undefined,
  });
  return res.json(tasks);
});

tasksRouter.get('/api/tasks/calendar', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const tasks = await listTasksForCalendar(user.tenantId!);
  return res.json(tasks);
});

tasksRouter.get('/api/tasks', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const entityType = req.query.entityType as string | undefined;
  const entityId = req.query.entityId as string | undefined;
  if (!entityType || !entityId) {
    return res.status(400).json({ error: 'entityType and entityId are required' });
  }
  if (!isSupportedTaskEntityType(entityType)) {
    return res.status(400).json({ error: 'Unsupported entityType' });
  }

  const entityTenantId = await findEntityTenantId(entityType, entityId);
  if (!entityTenantId || entityTenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Entity not found' });
  }

  const tasks = await listTasksForEntity(user.tenantId!, entityType, entityId);
  return res.json(tasks);
});

tasksRouter.post('/api/tasks', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const { entityType, entityId, title, description, assigneeId, dueDate, hasVideoCall, folderId, projectPhaseId } = req.body;
  const meetAttendeeEmail = parseMeetEmail(req.body.meetAttendeeEmail);
  if (meetAttendeeEmail === 'invalid') {
    return res.status(400).json({ error: 'Enter a valid email to invite to the call', field: 'meetAttendeeEmail' });
  }
  if (entityType === 'project' && hasVideoCall && !meetAttendeeEmail) {
    return res.status(400).json({ error: 'Add the email of the person to invite to the call', field: 'meetAttendeeEmail' });
  }
  if (!entityType || !entityId || !title || !assigneeId) {
    return res.status(400).json({ error: 'entityType, entityId, title, and assigneeId are required' });
  }
  if (!isSupportedTaskEntityType(entityType)) {
    return res.status(400).json({ error: 'Unsupported entityType' });
  }

  const entityTenantId = await findEntityTenantId(entityType, entityId);
  if (!entityTenantId || entityTenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Entity not found' });
  }

  const assignee = await findUserById(assigneeId);
  if (!assignee || assignee.tenantId !== user.tenantId) {
    return res.status(400).json({ error: 'Assignee not found' });
  }

  if (folderId) {
    const folder = await findTaskFolderById(folderId);
    if (!folder || folder.tenantId !== user.tenantId) {
      return res.status(400).json({ error: 'Folder not found' });
    }
  }

  if (projectPhaseId && !(await isPhaseOfProject(projectPhaseId, entityType, entityId))) {
    return res.status(400).json({ error: 'Phase not found' });
  }

  const task = await createTask({
    tenantId: user.tenantId!,
    entityType,
    entityId,
    title,
    description: description ?? null,
    assigneeId,
    dueDate: dueDate ?? null,
    hasVideoCall: hasVideoCall ?? false,
    createdById: user.id,
    folderId: folderId ?? null,
    projectPhaseId: projectPhaseId || null,
    meetAttendeeEmail: meetAttendeeEmail ?? null,
  });
  return res.status(201).json(task);
});

tasksRouter.patch('/api/tasks/:taskId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const task = await findTaskById(req.params.taskId);
  if (!task || task.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Task not found' });
  }

  if (req.body.assigneeId !== undefined) {
    const assignee = await findUserById(req.body.assigneeId);
    if (!assignee || assignee.tenantId !== user.tenantId) {
      return res.status(400).json({ error: 'Assignee not found' });
    }
  }

  if (req.body.folderId) {
    const folder = await findTaskFolderById(req.body.folderId);
    if (!folder || folder.tenantId !== user.tenantId) {
      return res.status(400).json({ error: 'Folder not found' });
    }
  }

  const meetAttendeeEmail = parseMeetEmail(req.body.meetAttendeeEmail);
  if (meetAttendeeEmail === 'invalid') {
    return res.status(400).json({ error: 'Enter a valid email to invite to the call', field: 'meetAttendeeEmail' });
  }
  const willHaveCall = req.body.hasVideoCall ?? task.hasVideoCall;
  const willHaveEmail = meetAttendeeEmail === undefined ? task.meetAttendeeEmail : meetAttendeeEmail;
  if (task.entityType === 'project' && willHaveCall && !willHaveEmail) {
    return res.status(400).json({ error: 'Add the email of the person to invite to the call', field: 'meetAttendeeEmail' });
  }

  if (req.body.projectPhaseId && !(await isPhaseOfProject(req.body.projectPhaseId, task.entityType, task.entityId))) {
    return res.status(400).json({ error: 'Phase not found' });
  }

  const updated = await updateTask(
    req.params.taskId,
    {
      title: req.body.title,
      description: req.body.description,
      assigneeId: req.body.assigneeId,
      dueDate: req.body.dueDate,
      completedAt: req.body.completedAt,
      hasVideoCall: req.body.hasVideoCall,
      folderId: req.body.folderId,
      projectPhaseId: req.body.projectPhaseId === undefined ? undefined : req.body.projectPhaseId || null,
      meetAttendeeEmail,
    },
    user.id,
  );
  return res.json(updated);
});

tasksRouter.delete('/api/tasks/:taskId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const task = await findTaskById(req.params.taskId);
  if (!task || task.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Task not found' });
  }

  await deleteTask(req.params.taskId, user.id);
  return res.status(204).end();
});

// Who can be @mentioned in a task chat (2026-10-06): every active login in the tenant, names only,
// for anyone signed in — a Member needs to mention people too, and /api/tenants/users is admin-only.
// Declared before /api/tasks/:taskId so the literal path isn't read as a task id.
tasksRouter.get('/api/tasks/mentionable-users', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const users = await prisma.user.findMany({
    where: { tenantId: user.tenantId!, status: 'active' },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  return res.json(users);
});

// One task by id (2026-10-06) — what a task_mention notification opens. Same tenant-only check as
// every other task route.
tasksRouter.get('/api/tasks/:taskId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const task = await findTaskById(req.params.taskId);
  if (!task || task.tenantId !== user.tenantId) return res.status(404).json({ error: 'Task not found' });
  return res.json(task);
});

// ---- Task chat (2026-10-06) ----

tasksRouter.get('/api/tasks/:taskId/comments', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const task = await findTaskById(req.params.taskId);
  if (!task || task.tenantId !== user.tenantId) return res.status(404).json({ error: 'Task not found' });
  return res.json(await listTaskComments(task.id));
});

tasksRouter.post('/api/tasks/:taskId/comments', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const task = await findTaskById(req.params.taskId);
  if (!task || task.tenantId !== user.tenantId) return res.status(404).json({ error: 'Task not found' });

  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!body) return res.status(400).json({ error: 'Write a message' });
  if (body.length > MAX_COMMENT_LENGTH) return res.status(400).json({ error: `Messages can be up to ${MAX_COMMENT_LENGTH} characters` });

  const comment = await createTaskComment({
    tenantId: user.tenantId!,
    task: { id: task.id, title: task.title },
    authorId: user.id,
    body,
    mentionedUserIds: await resolveMentionedUserIds(user.tenantId!, req.body.mentionedUserIds),
  });
  return res.status(201).json(comment);
});

// Only the author can delete their own message.
tasksRouter.delete('/api/tasks/:taskId/comments/:commentId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const comment = await findTaskCommentById(req.params.commentId);
  if (!comment || comment.tenantId !== user.tenantId || comment.taskId !== req.params.taskId) {
    return res.status(404).json({ error: 'Message not found' });
  }
  if (comment.authorId !== user.id) return res.status(403).json({ error: 'Only the author can delete this message' });
  await deleteTaskComment(comment.id);
  return res.status(204).end();
});
