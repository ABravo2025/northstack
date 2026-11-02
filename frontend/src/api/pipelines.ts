import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { PipelineStage, Pipeline, PipelineAssignmentMode, PipelinePurpose, StageAutomation, StageChecklistItem } from './types.js';

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
    data: {
      name: string;
      type: 'lead' | 'account';
      order?: number;
      assignmentMode?: PipelineAssignmentMode | null;
      stalledThresholdDays?: number | null;
      purpose?: PipelinePurpose;
    },
  ): Promise<Pipeline> => {
    const res = await apiFetch(`${API_BASE_URL}/api/pipelines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // `type` is intentionally not accepted here — immutable once created, see
  // docs/tareas/specredisenosalesv2.md §3.1.
  updatePipeline: async (
    token: string,
    pipelineId: string,
    data: {
      name?: string;
      order?: number;
      isActive?: boolean;
      assignmentMode?: PipelineAssignmentMode | null;
      stalledThresholdDays?: number | null;
      purpose?: PipelinePurpose;
    },
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
    data: {
      name: string;
      color?: string;
      order?: number;
      outcome?: 'open' | 'won' | 'lost';
      probability?: number;
      notifyOwnerOnEnter?: boolean;
    },
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
    data: {
      name?: string;
      color?: string;
      order?: number;
      outcome?: 'open' | 'won' | 'lost';
      probability?: number;
      isActive?: boolean;
      notifyOwnerOnEnter?: boolean;
      exitChecklist?: StageChecklistItem[];
      enterAutomations?: StageAutomation[];
    },
  ): Promise<PipelineStage> => {
    const res = await apiFetch(`${API_BASE_URL}/api/pipelines/${pipelineId}/stages/${stageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // Clientes C1: a new pipeline from a template, named in the company's language.
  createPipelineFromTemplate: async (token: string, template: 'new_business' | 'expansion' | 'renewal', language: 'es' | 'en'): Promise<Pipeline> => {
    const res = await apiFetch(`${API_BASE_URL}/api/pipelines/from-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ template, language }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // Clientes C1: tick / untick an exit-checklist item of a stage on a deal.
  setOpportunityChecklistItem: async (
    token: string,
    opportunityId: string,
    data: { stageId: string; itemId: string; done: boolean },
  ): Promise<{ checklistState: Record<string, string[]> }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/opportunities/${opportunityId}/checklist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // Clientes C3: hand a won deal off to its account owner.
  handoffOpportunity: async (
    token: string,
    opportunityId: string,
    data: { accountOwnerId: string; templateId?: string | null; kickoffAt?: string | null; welcomeContactId?: string | null },
  ): Promise<{ projectId: string | null; kickoffScheduled: boolean; welcomeSent: boolean }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/opportunities/${opportunityId}/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
};
