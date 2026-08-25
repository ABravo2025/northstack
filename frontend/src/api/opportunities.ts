import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { OpportunityContactLink, Opportunity } from './types.js';

export const opportunitiesApi = {
  // Opportunities
  listOpportunities: async (token: string): Promise<Opportunity[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/opportunities`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createOpportunity: async (
    token: string,
    data: {
      name: string;
      companyId: string;
      pipelineId: string;
      stageId?: string;
      amountCents: number;
      currency: string;
      estimatedCloseDate?: string | null;
      // Optional since Unit 8 (docs/tareas/specredisenosalesv2.md §3.8) —
      // omit it (or send null/undefined) to let the target Pipeline's
      // assignmentMode (round-robin / account owner) fill it in server-side;
      // required at the API layer only when the Pipeline has no assignmentMode.
      ownerId?: string | null;
      lossReasonId?: string | null;
      winReasonId?: string | null;
      closeNote?: string | null;
      nextStepDate?: string | null;
      nextStepNote?: string | null;
    },
  ): Promise<Opportunity> => {
    const res = await apiFetch(`${API_BASE_URL}/api/opportunities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updateOpportunity: async (
    token: string,
    opportunityId: string,
    data: Partial<{
      name: string;
      companyId: string;
      pipelineId: string;
      stageId: string;
      amountCents: number;
      currency: string;
      estimatedCloseDate: string | null;
      ownerId: string | null;
      lossReasonId: string | null;
      winReasonId: string | null;
      closeNote: string | null;
      nextStepDate: string | null;
      nextStepNote: string | null;
    }>,
  ): Promise<Opportunity> => {
    const res = await apiFetch(`${API_BASE_URL}/api/opportunities/${opportunityId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  deleteOpportunity: async (token: string, opportunityId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/opportunities/${opportunityId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },

  addOpportunityContact: async (
    token: string,
    opportunityId: string,
    data: { contactId: string; role?: string },
  ): Promise<OpportunityContactLink> => {
    const res = await apiFetch(`${API_BASE_URL}/api/opportunities/${opportunityId}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  removeOpportunityContact: async (token: string, opportunityId: string, contactId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/opportunities/${opportunityId}/contacts/${contactId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
