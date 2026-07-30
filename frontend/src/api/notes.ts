import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { TaskEntityType, Note } from './types.js';

export const notesApi = {
  // Notes
  listNotes: async (token: string, entityType: TaskEntityType, entityId: string): Promise<Note[]> => {
    const res = await apiFetch(
      `${API_BASE_URL}/api/notes?entityType=${entityType}&entityId=${entityId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createNote: async (
    token: string,
    data: { entityType: TaskEntityType; entityId: string; title: string; description: string },
  ): Promise<Note> => {
    const res = await apiFetch(`${API_BASE_URL}/api/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updateNote: async (
    token: string,
    noteId: string,
    data: Partial<{ title: string; description: string }>,
  ): Promise<Note> => {
    const res = await apiFetch(`${API_BASE_URL}/api/notes/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  deleteNote: async (token: string, noteId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/notes/${noteId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
