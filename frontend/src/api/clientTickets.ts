import { API_BASE_URL, apiFetch, throwApiError } from './http.js';

// Clientes C7: customer tickets with SLA.

export type ClientTicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ClientTicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';

export interface ClientTicket {
  id: string;
  number: number;
  subject: string;
  description: string | null;
  priority: ClientTicketPriority;
  status: ClientTicketStatus;
  companyId: string | null;
  company: { id: string; name: string } | null;
  contactId: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  assigneeId: string | null;
  source: string;
  firstResponseDueAt: string;
  resolutionDueAt: string;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  sla: { responseBreached: boolean; resolutionBreached: boolean; overdue: boolean };
  comments?: { id: string; authorId: string | null; body: string; internal: boolean; createdAt: string }[];
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

export const clientTicketsApi = {
  listClientTickets: (token: string, filter: { view?: 'open' | 'closed' | 'all'; companyId?: string; assigneeId?: string; q?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]);
    return call<ClientTicket[]>(token, `/api/client-tickets${qs.toString() ? `?${qs}` : ''}`);
  },
  getClientTicket: (token: string, id: string) => call<ClientTicket>(token, `/api/client-tickets/${id}`),
  createClientTicket: (
    token: string,
    input: { subject: string; description?: string | null; priority?: ClientTicketPriority; companyId?: string | null; requesterName?: string | null; requesterEmail?: string | null; assigneeId?: string | null },
  ) => call<ClientTicket>(token, '/api/client-tickets', { method: 'POST', body: input }),
  updateClientTicket: (
    token: string,
    id: string,
    input: { status?: ClientTicketStatus; priority?: ClientTicketPriority; assigneeId?: string | null; companyId?: string | null; subject?: string },
  ) => call<ClientTicket>(token, `/api/client-tickets/${id}`, { method: 'PATCH', body: input }),
  addClientTicketComment: (token: string, id: string, input: { body: string; internal?: boolean }) =>
    call<ClientTicket>(token, `/api/client-tickets/${id}/comments`, { method: 'POST', body: input }),
};
