import { API_BASE_URL, apiFetch, throwApiError } from './http.js';

// Two-step verification (spec-2fa.md).
async function post<T>(path: string, body: unknown, token?: string, method = 'POST'): Promise<T> {
  const res = await apiFetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export interface TwoStepSession {
  session: { token: string };
  deviceToken?: string | null;
  recoveryCodes?: string[];
  usedRecoveryCode?: boolean;
}

export interface TwoStepStatus {
  enabled: boolean;
  enabledAt: string | null;
  required: boolean;
  recoveryCodesLeft: number;
  trustedDevices: number;
}

export interface TwoStepSecret {
  secret: string;
  otpauthUrl: string;
}

// "Remember this device": one token per account, kept only in this browser.
const DEVICE_KEY = 'northstack:2fa-device:';
export function readDeviceToken(email: string): string | null {
  try {
    return localStorage.getItem(DEVICE_KEY + email.trim().toLowerCase());
  } catch {
    return null;
  }
}
export function storeDeviceToken(email: string, token: string) {
  try {
    localStorage.setItem(DEVICE_KEY + email.trim().toLowerCase(), token);
  } catch {
    // only a convenience: the code is asked again
  }
}

export const twoStepApi = {
  // Login, second step (no session yet; mfaToken from POST /api/auth/login).
  verifyLogin: (mfaToken: string, code: string, rememberDevice: boolean) => post<TwoStepSession>('/api/auth/login/2fa', { mfaToken, code, rememberDevice }),
  startLoginSetup: (mfaToken: string) => post<TwoStepSecret>('/api/auth/login/2fa/setup', { mfaToken }),
  confirmLoginSetup: (mfaToken: string, code: string) => post<TwoStepSession>('/api/auth/login/2fa/confirm', { mfaToken, code }),
  // Own settings.
  status: async (token: string): Promise<TwoStepStatus> => {
    const res = await apiFetch(`${API_BASE_URL}/api/users/me/2fa`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  startSetup: (token: string) => post<TwoStepSecret>('/api/users/me/2fa/setup', undefined, token),
  enable: (token: string, code: string) => post<{ recoveryCodes: string[] }>('/api/users/me/2fa/enable', { code }, token),
  disable: (token: string, code: string) => post<{ ok: true }>('/api/users/me/2fa/disable', { code }, token),
  regenerateCodes: (token: string, code: string) => post<{ recoveryCodes: string[] }>('/api/users/me/2fa/recovery-codes', { code }, token),
  forgetDevices: (token: string) => post<{ ok: true }>('/api/users/me/2fa/devices', undefined, token, 'DELETE'),
  // Someone else's.
  resetForUser: (token: string, userId: string) => post<{ ok: true }>(`/api/tenants/users/${encodeURIComponent(userId)}/2fa/reset`, {}, token),
};
