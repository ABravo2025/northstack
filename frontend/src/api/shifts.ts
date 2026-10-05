import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type {
  PublicShiftResponseView,
  Shift,
  ShiftAssignmentStatus,
  ShiftCandidate,
  ShiftAvailability,
  ShiftLocation,
  ShiftsSettings,
  ShiftTemplate,
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

  getPublicShiftResponse: (responseToken: string) => publicCall<PublicShiftResponseView>(`/api/public/shifts/respond/${encodeURIComponent(responseToken)}`),

  answerPublicShiftResponse: (responseToken: string, response: 'accepted' | 'declined', reason?: string) =>
    publicCall<PublicShiftResponseView>(`/api/public/shifts/respond/${encodeURIComponent(responseToken)}`, {
      method: 'POST',
      body: JSON.stringify({ response, reason }),
    }),
};
