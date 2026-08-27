import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { TaskEntityType, TagAssignmentLite, TagDefinition } from './types.js';

export const tagsApi = {
  // Every tag name ever used in the tenant — for the add-tag input's autocomplete.
  listTagDefinitions: async (token: string): Promise<TagDefinition[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tags`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  listTagsForEntity: async (token: string, entityType: TaskEntityType, entityId: string): Promise<TagAssignmentLite[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tags/${entityType}/${entityId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // Find-or-create by name + assign, in one call — see tagService.ts's assignTag.
  addTag: async (token: string, entityType: TaskEntityType, entityId: string, name: string): Promise<TagAssignmentLite> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tags/${entityType}/${entityId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  removeTag: async (token: string, tagAssignmentId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tags/assignments/${tagAssignmentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
