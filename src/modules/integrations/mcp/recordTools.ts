import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from './tools.js';
import { apiError, compact, confirmable, respond } from './toolHelpers.js';

// Record extras (2026-10-20): custom-field values and tags on records, task comments (@mentions),
// the task timer and folders, and an opportunity's contacts and stage history.

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;
const confirmationArg = z.string().optional().describe('Only on the second call, after the user explicitly confirmed');

// Custom-field values live under each record's own path in the app.
const CUSTOM_FIELD_BASE = { employee: '/hr/employees', company: '/companies', contact: '/contacts' } as const;
const TAG_ENTITY_TYPES = ['employee', 'company', 'contact', 'opportunity', 'project'] as const;

export function registerRecordTools(server: McpServer, ctx: ToolContext): void {
  const { api } = ctx;

  // ---------- Custom fields ----------

  server.registerTool('get_custom_fields', {
    title: 'Get custom fields',
    description: "An employee's, company's or contact's custom-field values. Definitions (names, types, options) come from list_catalogs kind=custom_fields.",
    inputSchema: { entityType: z.enum(['employee', 'company', 'contact']), entityId: z.string() },
    annotations: READ,
  }, async ({ entityType, entityId }) => respond(api.get(`${CUSTOM_FIELD_BASE[entityType]}/${entityId}/custom-fields`)));

  server.registerTool('set_custom_field', {
    title: 'Set custom field',
    description:
      "Set one custom field on an employee, company or contact (creates or replaces its value). value must match the field's type (text, number, date YYYY-MM-DD, boolean, or one of a select's options). value=null clears it.",
    inputSchema: {
      entityType: z.enum(['employee', 'company', 'contact']),
      entityId: z.string(),
      definitionId: z.string().describe('Custom field definition id (list_catalogs kind=custom_fields)'),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    },
    annotations: WRITE,
  }, async ({ entityType, entityId, definitionId, value }) => {
    const base = `${CUSTOM_FIELD_BASE[entityType]}/${entityId}/custom-fields`;
    const current = await api.get<any[]>(base);
    if (!current.ok) return apiError(current);
    const existing = (current.body ?? []).find((v) => v.customFieldDefinitionId === definitionId);
    if (value === null) {
      if (!existing) return { content: [{ type: 'text', text: 'That field was already empty.' }] };
      return respond(api.delete(`${base}/${existing.id}`), 'Custom field cleared.');
    }
    if (existing) return respond(api.patch(`${base}/${existing.id}`, { value }), 'Custom field updated.');
    return respond(api.post(base, { customFieldDefinitionId: definitionId, value }), 'Custom field set.');
  });

  // ---------- Tags ----------

  server.registerTool('list_record_tags', {
    title: 'List record tags',
    description: 'The tags on one record. All tags in use: list_catalogs kind=tags.',
    inputSchema: { entityType: z.enum(TAG_ENTITY_TYPES), entityId: z.string() },
    annotations: READ,
  }, async ({ entityType, entityId }) => respond(api.get(`/tags/${entityType}/${entityId}`)));

  server.registerTool('tag_record', {
    title: 'Tag record',
    description: 'Add a tag (by name; created if new) to a record.',
    inputSchema: { entityType: z.enum(TAG_ENTITY_TYPES), entityId: z.string(), name: z.string().min(1) },
    annotations: WRITE,
  }, async ({ entityType, entityId, name }) => respond(api.post(`/tags/${entityType}/${entityId}`, { name }), 'Tag added.'));

  server.registerTool('untag_record', {
    title: 'Remove tag',
    description: 'Remove a tag from a record, by the tag assignment id (list_record_tags).',
    inputSchema: { assignmentId: z.string() },
    annotations: WRITE,
  }, async ({ assignmentId }) => respond(api.delete(`/tags/assignments/${assignmentId}`), 'Tag removed.'));

  // ---------- Task comments, timer, folders ----------

  server.registerTool('list_task_comments', {
    title: 'List task comments',
    description: "A task's comment thread (chat), oldest first.",
    inputSchema: { taskId: z.string() },
    annotations: READ,
  }, async ({ taskId }) => respond(api.get(`/tasks/${taskId}/comments`)));

  server.registerTool('add_task_comment', {
    title: 'Comment on task',
    description: 'Post a comment on a task. To @mention people (they get notified), pass their user ids in mentionedUserIds (list_users).',
    inputSchema: {
      taskId: z.string(),
      body: z.string().min(1),
      mentionedUserIds: z.array(z.string()).optional(),
    },
    annotations: WRITE,
  }, async ({ taskId, ...input }) => respond(api.post(`/tasks/${taskId}/comments`, compact(input)), 'Comment posted.'));

  server.registerTool('delete_task_comment', {
    title: 'Delete task comment',
    description: 'Delete a comment (normally only your own). Two steps: first call returns a summary and confirmationToken; call again with it after the user confirms.',
    inputSchema: { taskId: z.string(), commentId: z.string(), confirmationToken: confirmationArg },
    annotations: DESTRUCTIVE,
  }, async ({ taskId, commentId, confirmationToken }) => confirmable(ctx, 'delete_task_comment', commentId, confirmationToken,
    async () => {
      const comments = await api.get<any[]>(`/tasks/${taskId}/comments`);
      if (!comments.ok) return comments;
      const list = Array.isArray(comments.body) ? comments.body : ((comments.body as any)?.comments ?? []);
      const comment = list.find((c: any) => c.id === commentId);
      return comment ? { ok: true, status: 200, body: comment } : { ok: false, status: 404, body: { error: 'Comment not found', code: 'not_found' } };
    },
    (c) => `You are about to delete the comment "${String(c.body ?? '').slice(0, 120)}".`,
    () => api.delete(`/tasks/${taskId}/comments/${commentId}`), 'Comment deleted.'));

  server.registerTool('task_timer', {
    title: 'Task timer',
    description: "Start or stop the timer on a task assigned to the connected person; the time adds up in the task's time spent and the timesheet suggestions.",
    inputSchema: { taskId: z.string(), action: z.enum(['start', 'stop']) },
    annotations: WRITE,
  }, async ({ taskId, action }) => respond(api.post(`/tasks/${taskId}/timer`, { action }), action === 'start' ? 'Timer started.' : 'Timer stopped.'));

  server.registerTool('list_task_folders', {
    title: 'List task folders',
    description: 'Task folders (an organizational grouping in My Tasks). Use the id as folderId in create_task/update_task.',
    annotations: READ,
  }, async () => respond(api.get('/task-folders')));

  server.registerTool('create_task_folder', {
    title: 'Create task folder',
    description: 'Create a task folder.',
    inputSchema: { name: z.string().min(1) },
    annotations: WRITE,
  }, async ({ name }) => respond(api.post('/task-folders', { name }), 'Folder created.'));

  server.registerTool('delete_task_folder', {
    title: 'Delete task folder',
    description: 'Delete a task folder; its tasks are kept, just without a folder. Two steps: first call returns a summary and confirmationToken; call again with it after the user confirms.',
    inputSchema: { id: z.string(), confirmationToken: confirmationArg },
    annotations: DESTRUCTIVE,
  }, async ({ id, confirmationToken }) => confirmable(ctx, 'delete_task_folder', id, confirmationToken,
    async () => {
      const folders = await api.get<any[]>('/task-folders');
      if (!folders.ok) return folders;
      const folder = (folders.body ?? []).find((f) => f.id === id);
      return folder ? { ok: true, status: 200, body: folder } : { ok: false, status: 404, body: { error: 'Folder not found', code: 'not_found' } };
    },
    (f) => `You are about to delete the folder "${f.name}" (its tasks are kept).`,
    () => api.delete(`/task-folders/${id}`), 'Folder deleted.'));

  // ---------- Opportunities: contacts and stage history ----------

  server.registerTool('link_opportunity_contact', {
    title: 'Link contact to opportunity',
    description: 'Add a contact to an opportunity (the people involved in the deal), optionally with their role in it.',
    inputSchema: { opportunityId: z.string(), contactId: z.string(), role: z.string().optional().describe('e.g. Decision maker') },
    annotations: WRITE,
  }, async ({ opportunityId, ...input }) => respond(api.post(`/opportunities/${opportunityId}/contacts`, compact(input)), 'Contact linked.'));

  server.registerTool('unlink_opportunity_contact', {
    title: 'Unlink contact from opportunity',
    description: 'Remove a contact from an opportunity (the contact itself is kept).',
    inputSchema: { opportunityId: z.string(), contactId: z.string() },
    annotations: WRITE,
  }, async ({ opportunityId, contactId }) => respond(api.delete(`/opportunities/${opportunityId}/contacts/${contactId}`), 'Contact unlinked.'));

  server.registerTool('opportunity_stage_history', {
    title: 'Opportunity stage history',
    description: 'When an opportunity moved between stages, and who moved it.',
    inputSchema: { opportunityId: z.string() },
    annotations: READ,
  }, async ({ opportunityId }) => respond(api.get(`/opportunities/${opportunityId}/stage-history`)));
}
