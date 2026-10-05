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

export async function call<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
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
  hasAgreement: boolean;
  deletionScheduledAt: string | null;
  attention: Attention[];
}

export type AgreementModule = 'payroll' | 'payments' | 'apiAccess';
export type AgreementLimit = 'maxPipelines' | 'maxTimeOffPolicies' | 'maxCustomRoles' | 'activityLogRetentionDays' | 'freeTrialSeatCap';

export interface PlanLimitsView {
  maxPipelines: number | null;
  maxTimeOffPolicies: number | null;
  maxCustomRoles: number | null;
  activityLogRetentionDays: number | null;
  payrollEnabled: boolean;
  paymentsEnabled: boolean;
  apiAccessEnabled: boolean;
  freeTrialSeatCap: number;
}

export interface Agreement {
  modules: Partial<Record<AgreementModule, boolean>>;
  limits: Partial<Record<AgreementLimit, number | null>>;
  reason: string;
  expiresAt: string | null;
  setAt: string;
  active: boolean;
}

export interface ClientDetail extends ClientRow {
  planLimits: PlanLimitsView;
  effectiveLimits: PlanLimitsView;
  agreement: Agreement | null;
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

export type ActionResult = { success: true; message?: string };

export interface AuditEntry {
  id: string;
  createdAt: string;
  action: string;
  reason: string;
  details: Record<string, unknown> | null;
  actor: string;
  tenant: { id: string; name: string } | null;
}

export interface PlatformStatus {
  id: string;
  key: string;
  label: string;
  color: string | null;
  isTerminal: boolean;
  isDefault: boolean;
  order: number;
  active: boolean;
}

export type FeedbackKind = 'tickets' | 'ideas';

export interface FeedbackItem {
  id: string;
  subject: string;
  description: string;
  createdAt: string;
  createdByType: string;
  tenant: { id: string; name: string };
  user: { id: string; firstName: string; lastName: string; email: string } | null;
  status: PlatformStatus;
}

export interface FeedbackNote {
  id: string;
  description: string;
  createdAt: string;
  createdBy: { firstName: string; lastName: string; platformRole: string | null } | null;
}

const post = <T>(path: string, token: string, body: unknown) => call<T>(path, token, { method: 'POST', body: JSON.stringify(body) });
const cid = (id: string) => encodeURIComponent(id);

export const adminActions = {
  extendTrial: (token: string, id: string, days: number, reason: string) => post<ActionResult>(`/api/platform/admin/clients/${cid(id)}/extend-trial`, token, { days, reason }),
  changePlan: (token: string, id: string, plan: 'starter' | 'growth', reason: string) => post<ActionResult>(`/api/platform/admin/clients/${cid(id)}/change-plan`, token, { plan, reason }),
  suspend: (token: string, id: string, reason: string) => post<ActionResult>(`/api/platform/admin/clients/${cid(id)}/suspend`, token, { reason }),
  reactivate: (token: string, id: string, reason: string) => post<ActionResult>(`/api/platform/admin/clients/${cid(id)}/reactivate`, token, { reason }),
  resetPassword: (token: string, id: string, userId: string, reason: string) =>
    post<ActionResult>(`/api/platform/admin/clients/${cid(id)}/users/${cid(userId)}/reset-password`, token, { reason }),
  setAgreement: (token: string, id: string, body: { modules: Record<string, boolean | 'plan'>; limits: Record<string, number | null | 'plan'>; expiresAt: string | null; reason: string }) =>
    call<ActionResult>(`/api/platform/admin/clients/${cid(id)}/agreement`, token, { method: 'PUT', body: JSON.stringify(body) }),
  clearAgreement: (token: string, id: string, reason: string) =>
    call<ActionResult>(`/api/platform/admin/clients/${cid(id)}/agreement`, token, { method: 'DELETE', body: JSON.stringify({ reason }) }),
  nextChargeDate: (token: string, id: string, date: string, reason: string) => post<ActionResult>(`/api/platform/admin/clients/${cid(id)}/next-charge-date`, token, { date, reason }),
  paymentReminder: (token: string, id: string, reason: string) => post<ActionResult>(`/api/platform/admin/clients/${cid(id)}/payment-reminder`, token, { reason }),
  // Returns the ZIP itself; the caller turns it into a download.
  exportData: async (token: string, id: string, reason: string): Promise<{ blob: Blob; filename: string }> => {
    const res = await fetch(`${API_BASE_URL}/api/platform/admin/clients/${cid(id)}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason }),
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
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'northstack-export.zip';
    return { blob: await res.blob(), filename };
  },
  audit: (token: string, tenantId?: string) => call<AuditEntry[]>(`/api/platform/admin/audit${tenantId ? `?tenantId=${cid(tenantId)}` : ''}`, token),
};

export const feedbackApi = {
  list: (token: string, kind: FeedbackKind, opts: { status?: string; search?: string }) => {
    const q = new URLSearchParams({ sortBy: 'createdAt', sortOrder: 'desc' });
    if (opts.status) q.set('status', opts.status);
    if (opts.search) q.set('search', opts.search);
    return call<FeedbackItem[]>(`/api/platform/${kind}?${q}`, token);
  },
  get: (token: string, kind: FeedbackKind, id: string) => call<FeedbackItem & { notes: FeedbackNote[] }>(`/api/platform/${kind}/${cid(id)}`, token),
  setStatus: (token: string, kind: FeedbackKind, id: string, statusId: string) =>
    call<FeedbackItem>(`/api/platform/${kind}/${cid(id)}`, token, { method: 'PATCH', body: JSON.stringify({ statusId }) }),
  addNote: (token: string, kind: FeedbackKind, id: string, description: string) => post<FeedbackNote>(`/api/platform/${kind}/${cid(id)}/notes`, token, { description }),
  statuses: (token: string, kind: FeedbackKind) => call<PlatformStatus[]>(`/api/platform/statuses?entityType=${kind === 'tickets' ? 'ticket' : 'idea'}`, token),
};

export interface BillingOverview {
  month: string;
  totals: Record<string, { paid: number; failed: number; refunded: number; count: number }>;
  mrrByCurrency: Record<string, number>;
  payingClients: number;
  pastDue: { id: string; name: string; amountCents: number; currency: string }[];
  cancellations: { id: string; name: string; requestedAt: string | null; effectiveAt: string | null; reason: string | null }[];
  upcoming: { id: string; name: string; at: string; amountCents: number; currency: string }[];
  monthly: { month: string; paid: Record<string, number> }[];
  invoices: { id: string; tenant: { id: string; name: string }; amountCents: number; currency: string; status: string; provider: string; at: string; periodStart: string; periodEnd: string }[];
}

export const adminBillingApi = {
  overview: (token: string, month: string) => call<BillingOverview>(`/api/platform/admin/billing?month=${encodeURIComponent(month)}`, token),
};

export interface AdminAnnouncement {
  id: string;
  type: 'feature_update' | 'policy_change';
  policyType: 'terms_of_service' | 'privacy_policy' | 'refund_policy' | null;
  title: string;
  summary: string;
  body: string;
  titleEs: string | null;
  summaryEs: string | null;
  bodyEs: string | null;
  targetPlans: string[];
  targetCountries: string[];
  targetTenantIds: string[];
  targetTenants: { id: string; name: string }[];
  publishedAt: string;
  scheduled: boolean;
  reach: number;
  read: number;
}

export const announcementsApi = {
  list: (token: string) => call<{ announcements: AdminAnnouncement[]; countries: string[] }>('/api/platform/admin/announcements', token),
  create: (token: string, body: Record<string, unknown>) => call<ActionResult>('/api/platform/admin/announcements', token, { method: 'POST', body: JSON.stringify(body) }),
  update: (token: string, id: string, body: Record<string, unknown>) =>
    call<ActionResult>(`/api/platform/admin/announcements/${encodeURIComponent(id)}`, token, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (token: string, id: string) => call<ActionResult>(`/api/platform/admin/announcements/${encodeURIComponent(id)}`, token, { method: 'DELETE' }),
};

export interface SupportRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'ended';
  mode: 'read_only' | 'edit';
  durationMinutes: number;
  reason: string;
  createdAt: string;
  requestExpiresAt: string;
  decidedAt: string | null;
  accessEndsAt: string | null;
  endedAt: string | null;
  endedBy: string | null;
  target: { name: string; email: string };
  requestedBy: string;
}

export const supportApi = {
  list: (token: string, id: string) => call<SupportRequest[]>(`/api/platform/admin/clients/${encodeURIComponent(id)}/support-access`, token),
  request: (token: string, id: string, body: { targetUserId: string; mode: 'read_only' | 'edit'; durationMinutes: number; reason: string }) =>
    call<ActionResult>(`/api/platform/admin/clients/${encodeURIComponent(id)}/support-access`, token, { method: 'POST', body: JSON.stringify(body) }),
  enter: (token: string, id: string, requestId: string) =>
    call<{ url: string }>(`/api/platform/admin/clients/${encodeURIComponent(id)}/support-access/${encodeURIComponent(requestId)}/enter`, token, { method: 'POST' }),
  end: (token: string, id: string, requestId: string) =>
    call<ActionResult>(`/api/platform/admin/clients/${encodeURIComponent(id)}/support-access/${encodeURIComponent(requestId)}/end`, token, { method: 'POST' }),
  scheduleDelete: (token: string, id: string, confirmName: string, reason: string) =>
    call<ActionResult>(`/api/platform/admin/clients/${encodeURIComponent(id)}/delete`, token, { method: 'POST', body: JSON.stringify({ confirmName, reason }) }),
  cancelDelete: (token: string, id: string, reason: string) =>
    call<ActionResult>(`/api/platform/admin/clients/${encodeURIComponent(id)}/cancel-delete`, token, { method: 'POST', body: JSON.stringify({ reason }) }),
};
