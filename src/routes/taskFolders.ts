import {
  createTaskFolder,
  deleteTaskFolder,
  findTaskFolderById,
  listTaskFoldersForTenant,
} from '../modules/tasks/taskFolderService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const taskFoldersRouter = createAsyncRouter();

// Same permission stance as tasks.ts: open to any authenticated tenant member, no role gate — a
// folder is just a personal/shared organizational label over My Tasks, not sensitive data.

taskFoldersRouter.get('/api/task-folders', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const folders = await listTaskFoldersForTenant(user.tenantId!);
  return res.json(folders);
});

taskFoldersRouter.post('/api/task-folders', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const folder = await createTaskFolder({ tenantId: user.tenantId!, name, createdById: user.id });
  return res.status(201).json(folder);
});

taskFoldersRouter.delete('/api/task-folders/:folderId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const folder = await findTaskFolderById(req.params.folderId);
  if (!folder || folder.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Folder not found' });
  }

  await deleteTaskFolder(req.params.folderId);
  return res.status(204).end();
});
