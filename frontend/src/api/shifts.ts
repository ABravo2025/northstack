import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { ShiftLocation, ShiftsSettings } from './types.js';

// Shifts module (docs/general/spec-shifts.md): settings and locations (Unidad 2). Shifts,
// assignments and availability join here in later units.

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) await throwApiError(res);
  return res.status === 204 ? (undefined as T) : res.json();
}

export interface ShiftLocationInput {
  name?: string;
  address?: string | null;
  timezone?: string;
  managerEmployeeId?: string | null;
  isActive?: boolean;
}

export const shiftsApi = {
  getShiftsSettings: (token: string) => call<ShiftsSettings>(token, '/api/shifts/settings'),

  updateShiftsSettings: (token: string, data: Partial<ShiftsSettings>) =>
    call<ShiftsSettings>(token, '/api/shifts/settings', { method: 'PATCH', body: JSON.stringify(data) }),

  listShiftLocations: (token: string, opts: { includeInactive?: boolean } = {}) =>
    call<{ locations: ShiftLocation[]; maxActiveLocations: number | null }>(
      token,
      `/api/shifts/locations${opts.includeInactive ? '?includeInactive=true' : ''}`,
    ),

  createShiftLocation: (token: string, data: ShiftLocationInput) =>
    call<ShiftLocation>(token, '/api/shifts/locations', { method: 'POST', body: JSON.stringify(data) }),

  updateShiftLocation: (token: string, id: string, data: ShiftLocationInput) =>
    call<ShiftLocation>(token, `/api/shifts/locations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteShiftLocation: (token: string, id: string) => call<void>(token, `/api/shifts/locations/${id}`, { method: 'DELETE' }),
};
