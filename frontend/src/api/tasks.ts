import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { TaskEntityType, Task } from './types.js';

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
