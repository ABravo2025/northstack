import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { PipelineStage, Pipeline } from './types.js';

export const pipelinesApi = {
  // Pipelines (sales pipelines for Opportunities)
  listPipelines: async (token: string): Promise<Pipeline[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/pipelines`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createPipeline: async (
    token: string,
    data: { name: string; type: 'lead' | 'account'; order?: number },
  ): Promise<Pipeline> => {
    const res = await apiFetch(`${API_BASE_URL}/api/pipelines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updatePipeline: async (
    token: string,
    pipelineId: string,
    data: { name?: string; type?: 'lead' | 'account'; order?: number; isActive?: boolean },
  ): Promise<Pipeline> => {
    const res = await apiFetch(`${API_BASE_URL}/api/pipelines/${pipelineId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createPipelineStage: async (
    token: string,
    pipelineId: string,
    data: { name: string; color?: string; order?: number; outcome?: 'open' | 'won' | 'lost' },
  ): Promise<PipelineStage> => {
    const res = await apiFetch(`${API_BASE_URL}/api/pipelines/${pipelineId}/stages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updatePipelineStage: async (
    token: string,
    pipelineId: string,
    stageId: string,
    data: { name?: string; color?: string; order?: number; outcome?: 'open' | 'won' | 'lost'; isActive?: boolean },
  ): Promise<PipelineStage> => {
    const res = await apiFetch(`${API_BASE_URL}/api/pipelines/${pipelineId}/stages/${stageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
};
