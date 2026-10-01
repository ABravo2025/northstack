import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type {
  ReligionKey,
  TimeOffAdjustment,
  TimeOffHoliday,
  TimeOffHolidayKind,
  TimeOffLedger,
  TimeOffRequestPreview,
  TimeOffSettings,
} from './types.js';

// Time Off company rules (2026-10): Settings → Time Off, the request preview, manual balance
// adjustments and a person's ledger.

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) await throwApiError(res);
  return res.status === 204 ? (undefined as T) : res.json();
}

export const timeOffRulesApi = {
  getTimeOffSettings: (token: string) => call<TimeOffSettings>(token, '/api/time-off/settings'),

  updateTimeOffSettings: (token: string, data: Partial<TimeOffSettings>) =>
    call<TimeOffSettings>(token, '/api/time-off/settings', { method: 'PATCH', body: JSON.stringify(data) }),

  listHolidayCountries: (token: string) => call<{ countryCode: string; name: string }[]>(token, '/api/time-off/countries'),

  listTimeOffHolidays: (token: string, year: number) => call<TimeOffHoliday[]>(token, `/api/time-off/holidays?year=${year}`),

  importTimeOffHolidays: (token: string, year: number) =>
    call<{ imported: number }>(token, '/api/time-off/holidays/import', { method: 'POST', body: JSON.stringify({ year }) }),

  createTimeOffHoliday: (token: string, data: { date: string; name: string; kind: TimeOffHolidayKind; religion?: ReligionKey }) =>
    call<TimeOffHoliday>(token, '/api/time-off/holidays', { method: 'POST', body: JSON.stringify(data) }),

  updateTimeOffHoliday: (token: string, id: string, data: { isOff?: boolean; name?: string }) =>
    call<TimeOffHoliday>(token, `/api/time-off/holidays/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteTimeOffHoliday: (token: string, id: string) => call<void>(token, `/api/time-off/holidays/${id}`, { method: 'DELETE' }),

  listReligionAssignments: (token: string) => call<{ employeeId: string; religion: ReligionKey }[]>(token, '/api/time-off/religions'),

  getEmployeeReligions: (token: string, employeeId: string) => call<ReligionKey[]>(token, `/api/hr/employees/${employeeId}/religious-holidays`),

  setEmployeeReligions: (token: string, employeeId: string, religions: ReligionKey[]) =>
    call<ReligionKey[]>(token, `/api/hr/employees/${employeeId}/religious-holidays`, { method: 'PUT', body: JSON.stringify({ religions }) }),

  previewTimeOffRequest: (token: string, data: { timeOffPolicyId: string; startDate: string; endDate: string }) =>
    call<TimeOffRequestPreview>(token, '/api/hr/time-off-requests/preview', { method: 'POST', body: JSON.stringify(data) }),

  createTimeOffAdjustment: (token: string, employeeId: string, data: { timeOffPolicyId: string; days: number; reason: string }) =>
    call<TimeOffAdjustment>(token, `/api/hr/employees/${employeeId}/time-off-adjustments`, { method: 'POST', body: JSON.stringify(data) }),

  getTimeOffLedger: (token: string, employeeId: string) => call<TimeOffLedger>(token, `/api/hr/employees/${employeeId}/time-off-ledger`),

  getMyReligiousHolidays: (token: string) =>
    call<{ linked: boolean; enabledReligions: ReligionKey[]; religions: ReligionKey[] }>(token, '/api/time-off/my-religious-holidays'),

  setMyReligiousHolidays: (token: string, religions: ReligionKey[]) =>
    call<ReligionKey[]>(token, '/api/time-off/my-religious-holidays', { method: 'PUT', body: JSON.stringify({ religions }) }),
};
