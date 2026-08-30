import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { ActivityEntityType, ActivityFeedPage, ActivityLogEntry, TaskEntityType } from './types.js';

export interface ListActivityFeedParams {
  entityType?: ActivityEntityType;
  userId?: string;
  action?: 'create' | 'update' | 'delete';
  from?: string;
  to?: string;
  cursor?: string;
}

export const activityApi = {
  listActivityForEntity: async (token: string, entityType: TaskEntityType, entityId: string): Promise<ActivityLogEntry[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/activity?entityType=${entityType}&entityId=${entityId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  listActivityFeed: async (token: string, params: ListActivityFeedParams = {}): Promise<ActivityFeedPage> => {
    const query = new URLSearchParams();
    if (params.entityType) query.set('entityType', params.entityType);
    if (params.userId) query.set('userId', params.userId);
    if (params.action) query.set('action', params.action);
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    if (params.cursor) query.set('cursor', params.cursor);

    const res = await apiFetch(`${API_BASE_URL}/api/activity/feed?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
};
