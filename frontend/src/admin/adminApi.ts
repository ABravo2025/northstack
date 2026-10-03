import { API_BASE_URL } from '../api/http';

// Admin Center v2 (2026-10-03). Its own token key, so an Admin session can never be mistaken for a
// customer-app session in the same browser storage.
export const ADMIN_TOKEN_KEY = 'adminToken';

export class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      message = (await res.json()).error ?? message;
    } catch {
      // keep the status text
    }
    throw new AdminApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export type ClientStatus = 'trialing' | 'expired' | 'no_plan' | 'active' | 'cancelling' | 'past_due' | 'suspended' | 'cancelled';
export type Plan = 'starter' | 'growth' | 'scale' | null;
export type ModuleKey = 'people' | 'timeoff' | 'sales' | 'tasks' | 'payroll' | 'payments';

export interface Attention {
  level: 'bad' | 'warn';
  kind: 'payment_failed' | 'trial_ending' | 'inactive' | 'cancelling' | 'grace';
  daysLeft?: number;
  days?: number;
}

export interface Health {
  score: number;
  access: number;
  modules: number;
  payments: number;
  growth: number;
}

export interface ClientRow {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  industry: string | null;
  createdAt: string;
  status: ClientStatus;
  plan: Plan;
  activeUsers: number;
  billedUsers: number | null;
  mrrCents: number;
  currency: string;
  health: Health;
  lastSeenAt: string | null;
  trialEndsAt: string | null;
  nextChargeAt: string | null;
  owner: { name: string; email: string } | null;
  openTickets: number;
  attention: Attention[];
}

export interface ClientDetail extends ClientRow {
  company: { legalName: string | null; website: string | null; phone: string | null; companySize: string | null; acquisitionChannel: string | null; currency: string };
  subscription: {
    status: string;
    provider: string | null;
    currency: string;
    lockedPriceCents: number;
    extraSeatPriceCents: number | null;
    currentPeriodEnd: string | null;
    cancelledAt: string | null;
    cancellationEffectiveAt: string | null;
    cancellationReason: string | null;
    card: string | null;
  } | null;
  users: { id: string; name: string; email: string; role: string; status: string; lastSeenAt: string | null; createdAt: string }[];
  dailyActive: { date: string; users: number }[];
  usage: { module: ModuleKey; included: boolean; users: number; adoptionPct: number; changes: number; lastUsedAt: string | null }[];
  invoices: { id: string; amountCents: number; currency: string; status: string; periodStart: string; periodEnd: string; paidAt: string | null; createdAt: string; provider: string }[];
  tickets: { id: string; subject: string; createdAt: string; status: string; open: boolean; color: string | null; reporter: string | null }[];
  timeline: { at: string; kind: string; text: string; by: string | null }[];
}

export interface Overview {
  clients: number;
  payingClients: number;
  trialing: number;
  activeUsers: number;
  mrrByCurrency: Record<string, number>;
  trialConversion: { pct: number; cohort: number } | null;
  openTickets: number;
  byPlan: { growth: number; starter: number; none: number };
  weeks: { weekStart: string; signups: number; paying: number }[];
  attention: { id: string; name: string; attention: Attention[] }[];
  recentSignups: { id: string; name: string; country: string | null; industry: string | null; status: ClientStatus; createdAt: string }[];
}

export interface StaffNote {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  createdBy: { firstName: string; lastName: string } | null;
}

export interface StaffTask {
  id: string;
  title: string;
  dueDate: string | null;
  completedAt: string | null;
}

export const adminApi = {
  login: (email: string, password: string) =>
    call<{ session?: { token: string } }>('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: (token: string) => call<{ user: { id: string; firstName: string; lastName: string; email: string; platformRole: string | null } }>('/api/auth/me', token),
  logout: (token: string) => call<unknown>('/api/auth/logout', token, { method: 'POST' }).catch(() => null),
  overview: (token: string) => call<Overview>('/api/platform/admin/overview', token),
  clients: (token: string) => call<ClientRow[]>('/api/platform/admin/clients', token),
  client: (token: string, id: string) => call<ClientDetail>(`/api/platform/admin/clients/${encodeURIComponent(id)}`, token),
  notes: (token: string, id: string) => call<StaffNote[]>(`/api/platform/tenants/${encodeURIComponent(id)}/notes`, token),
  addNote: (token: string, id: string, title: string, description: string) =>
    call<StaffNote>(`/api/platform/tenants/${encodeURIComponent(id)}/notes`, token, { method: 'POST', body: JSON.stringify({ title, description }) }),
  tasks: (token: string, id: string) => call<StaffTask[]>(`/api/platform/tenants/${encodeURIComponent(id)}/tasks`, token),
  addTask: (token: string, id: string, title: string, dueDate: string | null) =>
    call<StaffTask>(`/api/platform/tenants/${encodeURIComponent(id)}/tasks`, token, { method: 'POST', body: JSON.stringify({ title, dueDate }) }),
  setTaskDone: (token: string, id: string, taskId: string, completed: boolean) =>
    call<StaffTask>(`/api/platform/tenants/${encodeURIComponent(id)}/tasks/${encodeURIComponent(taskId)}`, token, { method: 'PATCH', body: JSON.stringify({ completed }) }),
};
