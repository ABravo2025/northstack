import { API_BASE_URL, apiFetch, throwApiError } from './http.js';

// Clientes C2 (spec-clientes-gastos-formularios.md): the Leads inbox.

export type LeadStatus = 'new' | 'working' | 'qualified' | 'converted' | 'disqualified';
export type QualificationKey = 'need' | 'budget' | 'authority' | 'timing';
export type Qualification = Partial<Record<QualificationKey, boolean | null>>;
export type TouchChannel = 'call' | 'email' | 'whatsapp' | 'linkedin' | 'meeting' | 'other';
export type TouchOutcome = 'no_answer' | 'replied' | 'meeting_booked' | 'not_interested';

export interface LeadTouch {
  id: string;
  step: number;
  channel: TouchChannel;
  outcome: TouchOutcome;
  note: string | null;
  byUserId: string | null;
  at: string;
}

export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  companyName: string | null;
  title: string | null;
  dealName: string | null;
  estimatedAmountCents: number | null;
  notes: string | null;
  leadSourceId: string | null;
  leadSource: { id: string; name: string } | null;
  ownerId: string | null;
  owner: { id: string; firstName: string; lastName: string } | null;
  status: LeadStatus;
  qualification: Qualification;
  canConvert: boolean;
  score: number;
  touchCount: number;
  nextTouchAt: string | null;
  formId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  disqualifyReason: string | null;
  convertedAt: string | null;
  convertedCompanyId: string | null;
  convertedContactId: string | null;
  convertedOpportunityId: string | null;
  createdAt: string;
  touches: LeadTouch[];
}

export type LeadInput = Partial<
  Pick<
    Lead,
    'firstName' | 'lastName' | 'email' | 'phone' | 'companyName' | 'title' | 'dealName' | 'estimatedAmountCents' | 'notes' | 'leadSourceId' | 'ownerId' | 'qualification'
  >
>;

export interface ConvertLeadInput {
  companyId?: string | null;
  companyName?: string | null;
  pipelineId: string;
  stageId?: string | null;
  opportunityName?: string | null;
  amountCents?: number | null;
  ownerId?: string | null;
}

async function call<T>(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await apiFetch(`${API_BASE_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export const leadsApi = {
  listLeads: (token: string, filter: { view?: 'open' | 'converted' | 'disqualified'; ownerId?: string; q?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]);
    return call<Lead[]>(token, `/api/leads${qs.toString() ? `?${qs}` : ''}`);
  },
  getLead: (token: string, id: string) => call<Lead>(token, `/api/leads/${id}`),
  createLead: (token: string, input: LeadInput) => call<Lead>(token, '/api/leads', { method: 'POST', body: input }),
  updateLead: (token: string, id: string, input: LeadInput) => call<Lead>(token, `/api/leads/${id}`, { method: 'PATCH', body: input }),
  addLeadTouch: (token: string, id: string, input: { channel: TouchChannel; outcome: TouchOutcome; note?: string }) =>
    call<Lead>(token, `/api/leads/${id}/touches`, { method: 'POST', body: input }),
  disqualifyLead: (token: string, id: string, reason: string) => call<Lead>(token, `/api/leads/${id}/disqualify`, { method: 'POST', body: { reason } }),
  reopenLead: (token: string, id: string) => call<Lead>(token, `/api/leads/${id}/reopen`, { method: 'POST', body: {} }),
  convertLead: (token: string, id: string, input: ConvertLeadInput) =>
    call<{ lead: Lead; companyId: string; contactId: string; opportunityId: string }>(token, `/api/leads/${id}/convert`, { method: 'POST', body: input }),
};
