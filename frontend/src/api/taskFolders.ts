import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { TaskFolder } from './types.js';

export const taskFoldersApi = {
  listTaskFolders: async (token: string): Promise<TaskFolder[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/task-folders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createTaskFolder: async (token: string, name: string): Promise<TaskFolder> => {
    const res = await apiFetch(`${API_BASE_URL}/api/task-folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  deleteTaskFolder: async (token: string, folderId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/task-folders/${folderId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
