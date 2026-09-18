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
import { findUserById } from '../modules/tenant/tenantService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const tasksRouter = createAsyncRouter();

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

  const { entityType, entityId, title, description, assigneeId, dueDate, hasVideoCall, folderId } = req.body;
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
