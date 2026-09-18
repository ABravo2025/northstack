import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { TaskEntityType, Task } from './types.js';

export interface ListTasksHubParams {
  includeCompleted?: boolean;
  // undefined = no folder filter, 'none' = only tasks with no folder, otherwise a folder id.
  folderId?: string | 'none';
  search?: string;
}

export const tasksApi = {
  // Tasks
  listTasks: async (token: string, entityType: TaskEntityType, entityId: string): Promise<Task[]> => {
    const res = await apiFetch(
      `${API_BASE_URL}/api/tasks?entityType=${entityType}&entityId=${entityId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  listMyTasks: async (token: string): Promise<Task[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tasks/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // Backs the My Tasks hub page (`/tasks`) — every task the user is assignee OR creator of, with
  // completed/folder/search filters. Same underlying endpoint as listMyTasks (`scope=hub` opts
  // into the richer response) so the Overview widget's simpler call keeps working unchanged.
  listTasksHub: async (token: string, params: ListTasksHubParams = {}): Promise<Task[]> => {
    const qs = new URLSearchParams({ scope: 'hub' });
    if (params.includeCompleted) qs.set('includeCompleted', 'true');
    if (params.folderId !== undefined) qs.set('folderId', params.folderId);
    if (params.search) qs.set('search', params.search);
    const res = await apiFetch(`${API_BASE_URL}/api/tasks/mine?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  listTasksForCalendar: async (token: string): Promise<Task[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tasks/calendar`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createTask: async (
    token: string,
    data: {
      entityType: TaskEntityType;
      entityId: string;
      title: string;
      description?: string | null;
      assigneeId: string;
      dueDate?: string | null;
      hasVideoCall?: boolean;
      folderId?: string | null;
    },
  ): Promise<Task> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updateTask: async (
    token: string,
    taskId: string,
    data: Partial<{
      title: string;
      description: string | null;
      assigneeId: string;
      dueDate: string | null;
      completedAt: string | null;
      hasVideoCall: boolean;
      folderId: string | null;
    }>,
  ): Promise<Task> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  deleteTask: async (token: string, taskId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
