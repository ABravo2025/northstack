import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type {
  MyPayrollHours,
  ClockBoardLocation,
  ClockCodeView,
  ClockEntry,
  ClockLocationConfig,
  ClockMe,
  AvailableShift,
  ShiftRequest,
  SwapTarget,
  PublicShiftResponseView,
  Shift,
  ShiftAssignmentStatus,
  ShiftCandidate,
  ShiftAvailability,
  ShiftLocation,
  ShiftSkill,
  ShiftsSettings,
  ShiftTemplate,
  HoursReport,
  ScheduleCost,
  TimeEntry,
  TimesheetApprovalRow,
  TimesheetStatus,
  TimesheetWeek,
  TimeSuggestion,
} from './types.js';

// Shifts module (docs/general/spec-shifts.md): settings and locations (Unidad 2), shifts,
// assignments, templates and answers (Unidades 3, 5, 6).

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) await throwApiError(res);
  return res.status === 204 ? (undefined as T) : res.json();
}

// The public answer page has no session.
async function publicCall<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export interface ShiftLocationInput {
  name?: string;
  address?: string | null;
  timezone?: string;
  managerEmployeeId?: string | null;
  isActive?: boolean;
}

export interface ShiftInput {
  locationId?: string;
  date?: string;
  startMinute?: number;
  endMinute?: number;
  position?: string | null;
  notes?: string | null;
  headcount?: number;
  requiredSkillIds?: string[];
}

export const shiftsApi = {
  getShiftsSettings: (token: string) => call<ShiftsSettings>(token, '/api/shifts/settings'),

  updateShiftsSettings: (token: string, data: Partial<ShiftsSettings>) =>
    call<ShiftsSettings>(token, '/api/shifts/settings', { method: 'PATCH', body: JSON.stringify(data) }),

  listShiftLocations: (token: string, opts: { includeInactive?: boolean } = {}) =>
    call<{ locations: ShiftLocation[]; maxActiveLocations: number | null; managedLocationIds: string[] }>(
      token,
      `/api/shifts/locations${opts.includeInactive ? '?includeInactive=true' : ''}`,
    ),

  createShiftLocation: (token: string, data: ShiftLocationInput) =>
    call<ShiftLocation>(token, '/api/shifts/locations', { method: 'POST', body: JSON.stringify(data) }),

  updateShiftLocation: (token: string, id: string, data: ShiftLocationInput) =>
    call<ShiftLocation>(token, `/api/shifts/locations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteShiftLocation: (token: string, id: string) => call<void>(token, `/api/shifts/locations/${id}`, { method: 'DELETE' }),

  listShifts: (token: string, from: string, to: string, locationId?: string) =>
    call<Shift[]>(token, `/api/shifts?from=${from}&to=${to}${locationId ? `&locationId=${locationId}` : ''}`),

  listMyShifts: (token: string, from: string, to: string) => call<Shift[]>(token, `/api/shifts/mine?from=${from}&to=${to}`),

  createShift: (token: string, data: ShiftInput) => call<Shift>(token, '/api/shifts', { method: 'POST', body: JSON.stringify(data) }),

  updateShift: (token: string, id: string, data: ShiftInput) =>
    call<Shift>(token, `/api/shifts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteShift: (token: string, id: string) => call<void>(token, `/api/shifts/${id}`, { method: 'DELETE' }),

  cancelShift: (token: string, id: string) => call<Shift>(token, `/api/shifts/${id}/cancel`, { method: 'POST' }),

  listShiftCandidates: (token: string, id: string) => call<ShiftCandidate[]>(token, `/api/shifts/${id}/candidates`),

  // Throws an ApiError with status 409 and body { code: 'warnings' | 'blocked', details } when
  // someone can't (or shouldn't without confirming) take the shift.
  assignToShift: (token: string, id: string, employeeIds: string[], force = false) =>
    call<Shift>(token, `/api/shifts/${id}/assignments`, { method: 'POST', body: JSON.stringify({ employeeIds, force }) }),

  unassignFromShift: (token: string, id: string, assignmentId: string) =>
    call<Shift>(token, `/api/shifts/${id}/assignments/${assignmentId}`, { method: 'DELETE' }),

  publishShifts: (token: string, shiftIds: string[]) =>
    call<{ published: number; notified: number; shifts: Shift[] }>(token, '/api/shifts/publish', { method: 'POST', body: JSON.stringify({ shiftIds }) }),

  copyShiftWeek: (token: string, fromWeekStart: string, toWeekStart: string, locationId?: string) =>
    call<{ created: number; skippedAssignments: number }>(token, '/api/shifts/copy-week', {
      method: 'POST',
      body: JSON.stringify({ fromWeekStart, toWeekStart, locationId }),
    }),

  respondToShift: (token: string, assignmentId: string, response: Exclude<ShiftAssignmentStatus, 'pending'>, reason?: string) =>
    call<Shift>(token, `/api/shifts/assignments/${assignmentId}/respond`, { method: 'POST', body: JSON.stringify({ response, reason }) }),

  listShiftTemplates: (token: string) => call<ShiftTemplate[]>(token, '/api/shifts/templates'),

  createShiftTemplate: (token: string, data: { name: string; startMinute: number; endMinute: number; locationId?: string | null; position?: string | null }) =>
    call<ShiftTemplate>(token, '/api/shifts/templates', { method: 'POST', body: JSON.stringify(data) }),

  deleteShiftTemplate: (token: string, id: string) => call<void>(token, `/api/shifts/templates/${id}`, { method: 'DELETE' }),

  listMyAvailability: (token: string) => call<ShiftAvailability[]>(token, '/api/shifts/availability'),

  createMyAvailability: (token: string, data: Omit<ShiftAvailability, 'id'>) =>
    call<ShiftAvailability>(token, '/api/shifts/availability', { method: 'POST', body: JSON.stringify(data) }),

  deleteMyAvailability: (token: string, id: string) => call<void>(token, `/api/shifts/availability/${id}`, { method: 'DELETE' }),

  // `enabled` is false on plans without skills (Starter): the list is then always empty.
  listShiftSkills: (token: string, opts: { includeInactive?: boolean } = {}) =>
    call<{ enabled: boolean; skills: ShiftSkill[] }>(token, `/api/shifts/skills${opts.includeInactive ? '?includeInactive=true' : ''}`),

  createShiftSkill: (token: string, name: string) => call<ShiftSkill>(token, '/api/shifts/skills', { method: 'POST', body: JSON.stringify({ name }) }),

  updateShiftSkill: (token: string, id: string, data: { name?: string; isActive?: boolean }) =>
    call<ShiftSkill>(token, `/api/shifts/skills/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  setShiftSkillHolder: (token: string, skillId: string, employeeId: string, expiresAt: string | null) =>
    call<ShiftSkill>(token, `/api/shifts/skills/${skillId}/holders/${employeeId}`, { method: 'PUT', body: JSON.stringify({ expiresAt }) }),

  removeShiftSkillHolder: (token: string, skillId: string, employeeId: string) =>
    call<ShiftSkill>(token, `/api/shifts/skills/${skillId}/holders/${employeeId}`, { method: 'DELETE' }),

  getPublicShiftResponse: (responseToken: string) => publicCall<PublicShiftResponseView>(`/api/public/shifts/respond/${encodeURIComponent(responseToken)}`),

  answerPublicShiftResponse: (responseToken: string, response: 'accepted' | 'declined', reason?: string) =>
    publicCall<PublicShiftResponseView>(`/api/public/shifts/respond/${encodeURIComponent(responseToken)}`, {
      method: 'POST',
      body: JSON.stringify({ response, reason }),
    }),

  // Timesheet (Unidades 9 y 11). The viewer's timezone decides which day a task or event falls on.
  getTimesheet: (token: string, params: { weekStart?: string; employeeId?: string } = {}) => {
    const qs = new URLSearchParams({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    if (params.weekStart) qs.set('weekStart', params.weekStart);
    if (params.employeeId) qs.set('employeeId', params.employeeId);
    return call<TimesheetWeek>(token, `/api/shifts/timesheet?${qs.toString()}`);
  },
  addTimeEntry: (
    token: string,
    data: {
      date: string;
      minutes: number;
      description?: string | null;
      billable?: boolean;
      companyId?: string | null;
      projectId?: string | null;
      source?: TimeSuggestion['sourceType'];
      sourceId?: string;
    },
  ) => call<{ id: string; weekStart: string }>(token, '/api/shifts/timesheet/entries', { method: 'POST', body: JSON.stringify(data) }),
  updateTimeEntry: (token: string, entryId: string, data: Partial<Pick<TimeEntry, 'date' | 'minutes' | 'description' | 'billable' | 'companyId' | 'projectId' | 'reason'>>) =>
    call<{ id: string }>(token, `/api/shifts/timesheet/entries/${entryId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTimeEntry: (token: string, entryId: string) => call<void>(token, `/api/shifts/timesheet/entries/${entryId}`, { method: 'DELETE' }),
  dismissTimeSuggestion: (token: string, sourceType: string, sourceId: string) =>
    call<void>(token, '/api/shifts/timesheet/suggestions/dismiss', { method: 'POST', body: JSON.stringify({ sourceType, sourceId }) }),
  restoreTimeSuggestion: (token: string, sourceType: string, sourceId: string) =>
    call<void>(token, '/api/shifts/timesheet/suggestions/restore', { method: 'POST', body: JSON.stringify({ sourceType, sourceId }) }),
  submitTimesheet: (token: string, weekStart: string) =>
    call<{ status: TimesheetStatus }>(token, '/api/shifts/timesheet/submit', { method: 'POST', body: JSON.stringify({ weekStart }) }),
  addTimesheetAdjustment: (token: string, timesheetId: string, data: { minutes: number; reason: string; description?: string | null }) =>
    call<{ id: string; weekStart: string }>(token, `/api/shifts/timesheet/${timesheetId}/adjustments`, {
      method: 'POST',
      body: JSON.stringify({ ...data, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    }),
  listTimesheetApprovals: (token: string, status: TimesheetStatus = 'submitted') =>
    call<{ canApprove: boolean; timesheets: TimesheetApprovalRow[] }>(token, `/api/shifts/timesheet/approvals?status=${status}`),
  decideTimesheet: (token: string, timesheetId: string, decision: 'approve' | 'return', note?: string) =>
    call<{ status: TimesheetStatus }>(token, `/api/shifts/timesheet/${timesheetId}/decision`, { method: 'POST', body: JSON.stringify({ decision, note }) }),
  // Phase 2, block A: open shifts, hand-overs and swaps.
  listAvailableShifts: (token: string) => call<{ items: AvailableShift[] }>(token, '/api/shifts/available'),
  listShiftRequests: (token: string, scope: 'mine' | 'manage' = 'mine') =>
    call<{ canManage?: boolean; employeeId?: string | null; requests: ShiftRequest[] }>(token, `/api/shifts/requests${scope === 'manage' ? '?scope=manage' : ''}`),
  setShiftOpen: (token: string, shiftId: string, open: boolean) =>
    call<Shift>(token, `/api/shifts/${shiftId}/open`, { method: 'POST', body: JSON.stringify({ open }) }),
  claimShift: (token: string, shiftId: string) => call<ShiftRequest>(token, `/api/shifts/${shiftId}/claim`, { method: 'POST' }),
  giveShift: (token: string, assignmentId: string, reason?: string) =>
    call<ShiftRequest>(token, `/api/shifts/assignments/${assignmentId}/give`, { method: 'POST', body: JSON.stringify({ reason }) }),
  takeShift: (token: string, requestId: string) => call<ShiftRequest>(token, `/api/shifts/requests/${requestId}/take`, { method: 'POST' }),
  listSwapTargets: (token: string, assignmentId: string) => call<{ targets: SwapTarget[] }>(token, `/api/shifts/assignments/${assignmentId}/swap-targets`),
  proposeSwap: (token: string, assignmentId: string, targetAssignmentId: string, reason?: string) =>
    call<ShiftRequest>(token, `/api/shifts/assignments/${assignmentId}/swap`, { method: 'POST', body: JSON.stringify({ targetAssignmentId, reason }) }),
  answerSwap: (token: string, requestId: string, accept: boolean) =>
    call<ShiftRequest>(token, `/api/shifts/requests/${requestId}/answer`, { method: 'POST', body: JSON.stringify({ accept }) }),
  decideShiftRequest: (token: string, requestId: string, approve: boolean, note?: string) =>
    call<ShiftRequest>(token, `/api/shifts/requests/${requestId}/decide`, { method: 'POST', body: JSON.stringify({ approve, note }) }),
  cancelShiftRequest: (token: string, requestId: string) => call<void>(token, `/api/shifts/requests/${requestId}/cancel`, { method: 'POST' }),
  // Phase 2, block B: clock-in.
  getClockMe: (token: string) => call<ClockMe>(token, '/api/clock/me'),
  getClockCode: (token: string, code: string) => call<ClockCodeView>(token, `/api/clock/code/${encodeURIComponent(code)}`),
  clockIn: (token: string, data: { code?: string; locationId?: string; geo?: { lat: number; lng: number } | null }) =>
    call<ClockEntry>(token, '/api/clock/in', { method: 'POST', body: JSON.stringify(data) }),
  clockOut: (token: string, data: { breakMinutes?: number; geo?: { lat: number; lng: number } | null }) =>
    call<ClockEntry & { overtime: boolean }>(token, '/api/clock/out', { method: 'POST', body: JSON.stringify(data) }),
  clockBreak: (token: string, action: 'start' | 'end') => call<ClockEntry>(token, `/api/clock/break/${action}`, { method: 'POST' }),
  getClockBoard: (token: string, locationId?: string) =>
    call<{ canManage: boolean; locations: ClockBoardLocation[]; review: ClockEntry[] }>(token, `/api/clock/board${locationId ? `?locationId=${locationId}` : ''}`),
  correctClockEntry: (token: string, entryId: string, data: { clockInAt?: string; clockOutAt?: string; breakMinutes?: number; reason: string; markReviewed?: boolean }) =>
    call<ClockEntry>(token, `/api/clock/entries/${entryId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  listClockLocations: (token: string) => call<{ locations: ClockLocationConfig[] }>(token, '/api/clock/locations'),
  updateClockLocation: (token: string, locationId: string, data: Partial<Omit<ClockLocationConfig, 'id' | 'name' | 'isActive' | 'clockCode'>>) =>
    call<ClockLocationConfig>(token, `/api/clock/locations/${locationId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  regenerateClockCode: (token: string, locationId: string) => call<{ id: string; clockCode: string }>(token, `/api/clock/locations/${locationId}/code`, { method: 'POST' }),
  getScheduleCost: (token: string, from: string, to: string, locationId?: string) =>
    call<ScheduleCost | null>(token, `/api/shifts/cost?from=${from}&to=${to}${locationId ? `&locationId=${locationId}` : ''}`),
  getHoursReport: (token: string, params: { from: string; to: string; groupBy: HoursReport['groupBy'] }) =>
    call<HoursReport>(token, `/api/shifts/timesheet/reports?from=${params.from}&to=${params.to}&groupBy=${params.groupBy}`),
  // Timesheet → Payroll: the hours that went to payroll (own; hours only).
  getMyPayrollHours: (token: string) => call<MyPayrollHours[]>(token, '/api/shifts/timesheet/payroll-hours'),
  reopenTimesheet: (token: string, timesheetId: string, reason: string) =>
    call<{ status: TimesheetStatus }>(token, `/api/shifts/timesheet/${timesheetId}/reopen`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // Phase 2, block D: hours report for a client (PDF, private link, email).
  getClientReportDefaults: (token: string, companyId: string) =>
    call<{ projects: { id: string; name: string }[]; email: string | null }>(token, `/api/shifts/client-reports/defaults?companyId=${encodeURIComponent(companyId)}`),
  createClientReport: (token: string, input: ClientReportInput & { email: string | null }) =>
    call<{ url: string; expiresAt: string; emailedTo: string | null }>(token, '/api/shifts/client-reports', { method: 'POST', body: JSON.stringify(input) }),
  downloadClientReportPdf: async (token: string, input: ClientReportInput): Promise<Blob> => {
    const res = await apiFetch(`${API_BASE_URL}/api/shifts/client-reports/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
    if (!res.ok) await throwApiError(res);
    return res.blob();
  },
  // Phase 2, block E: suggested schedule (drafts only).
  suggestWeek: (token: string, weekStart: string, locationId?: string) =>
    call<ScheduleSuggestions>(token, '/api/shifts/suggestions', { method: 'POST', body: JSON.stringify({ weekStart, locationId }) }),
  applySuggestions: (token: string, items: { shiftId: string; employeeId: string }[], locationId?: string) =>
    call<{ applied: number; skipped: number }>(token, '/api/shifts/suggestions/apply', { method: 'POST', body: JSON.stringify({ items, locationId }) }),
  getPublicClientReport: (reportToken: string) => publicCall<PublicClientReport>(`/api/public/client-reports/${encodeURIComponent(reportToken)}/view`),
  publicClientReportPdfUrl: (reportToken: string, lang: string) => `${API_BASE_URL}/api/public/client-reports/${encodeURIComponent(reportToken)}/pdf?lang=${lang}`,
};

export interface ClientReportInput {
  companyId: string;
  projectId: string | null;
  from: string;
  to: string;
  showPeople: boolean;
  lang: string;
}

export interface PublicClientReport {
  tenantName: string;
  company: { id: string; name: string };
  project: { id: string; name: string } | null;
  from: string;
  to: string;
  showPeople: boolean;
  lines: { date: string; person: string | null; description: string | null; project: string | null; minutes: number; billable: boolean }[];
  totalMinutes: number;
  billableMinutes: number;
  expiresAt: string;
}

export interface SuggestedShift {
  id: string;
  date: string;
  startMinute: number;
  endMinute: number;
  position: string | null;
  location: { id: string; name: string };
}

export interface ScheduleSuggestions {
  shifts: number;
  suggestions: { shift: SuggestedShift; employee: { id: string; name: string }; warnings: string[] }[];
  unfilled: { shift: SuggestedShift; places: number }[];
}
