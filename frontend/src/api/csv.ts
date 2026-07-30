import { API_BASE_URL, apiFetch, throwApiError } from './http.js';

export const csvApi = {
  // CSV import/export
  exportEmployeesCsv: async (token: string): Promise<string> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/export/csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.text();
  },
  importEmployeesCsv: async (token: string, csv: string): Promise<{ created: number; errors: { row: number; message: string }[] }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/import/csv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ csv }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  employeesCsvTemplate: async (token: string): Promise<string> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/template/csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.text();
  },
};
