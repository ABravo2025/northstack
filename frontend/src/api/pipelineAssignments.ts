import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { PipelineAssignmentUser } from './types.js';

export const pipelineAssignmentsApi = {
  // Round-robin participants (docs/tareas/specredisenosalesv2.md §3.8)
  listPipelineAssignmentUsers: async (token: string, pipelineId: string): Promise<PipelineAssignmentUser[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/pipelines/${pipelineId}/assignment-users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  assignUserToPipeline: async (token: string, pipelineId: string, userId: string): Promise<PipelineAssignmentUser> => {
    const res = await apiFetch(`${API_BASE_URL}/api/pipelines/${pipelineId}/assignment-users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  unassignUserFromPipeline: async (token: string, pipelineId: string, userId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/pipelines/${pipelineId}/assignment-users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },

  // One-time bulk-add convenience, not a live department<->pipeline binding
  // (docs/tareas/specredisenosalesv2.md §3.8).
  assignPipelineUsersByDepartments: async (
    token: string,
    pipelineId: string,
    departmentIds: string[],
  ): Promise<{ resolvedUserCount: number; addedCount: number; alreadyAssignedCount: number }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/pipelines/${pipelineId}/assignment-users/from-departments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ departmentIds }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
};
