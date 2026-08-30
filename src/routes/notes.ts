import {
  createNote,
  deleteNote,
  findEntityTenantId,
  findNoteById,
  isSupportedNoteEntityType,
  listNotesForEntity,
  updateNote,
} from '../modules/notes/noteService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const notesRouter = createAsyncRouter();

// Permissions: open to any authenticated tenant member, same as Tasks
// (confirmed with the user 2026-07-29, "mismo criterio ya confirmado para
// Tasks") — revisit once custom roles exist.

notesRouter.get('/api/notes', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const entityType = req.query.entityType as string | undefined;
  const entityId = req.query.entityId as string | undefined;
  if (!entityType || !entityId) {
    return res.status(400).json({ error: 'entityType and entityId are required' });
  }
  if (!isSupportedNoteEntityType(entityType)) {
    return res.status(400).json({ error: 'Unsupported entityType' });
  }

  const entityTenantId = await findEntityTenantId(entityType, entityId);
  if (!entityTenantId || entityTenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Entity not found' });
  }

  const notes = await listNotesForEntity(user.tenantId!, entityType, entityId);
  return res.json(notes);
});

notesRouter.post('/api/notes', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const { entityType, entityId, title, description } = req.body;
  if (!entityType || !entityId || !title?.trim() || !description?.trim()) {
    return res.status(400).json({ error: 'entityType, entityId, title, and description are required' });
  }
  if (!isSupportedNoteEntityType(entityType)) {
    return res.status(400).json({ error: 'Unsupported entityType' });
  }

  const entityTenantId = await findEntityTenantId(entityType, entityId);
  if (!entityTenantId || entityTenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Entity not found' });
  }

  const note = await createNote({
    tenantId: user.tenantId!,
    entityType,
    entityId,
    title: title.trim(),
    description: description.trim(),
    createdById: user.id,
  });
  return res.status(201).json(note);
});

notesRouter.patch('/api/notes/:noteId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const note = await findNoteById(req.params.noteId);
  if (!note || note.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Note not found' });
  }

  const updated = await updateNote(
    req.params.noteId,
    {
      title: req.body.title,
      description: req.body.description,
    },
    user.id,
  );
  return res.json(updated);
});

notesRouter.delete('/api/notes/:noteId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const note = await findNoteById(req.params.noteId);
  if (!note || note.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Note not found' });
  }

  await deleteNote(req.params.noteId, user.id);
  return res.status(204).end();
});
