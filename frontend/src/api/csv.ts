import { API_BASE_URL, apiFetch, throwApiError } from './http.js';

export interface CsvImportResult {
  created: number;
  errors: { row: number; message: string }[];
}

// Shared shape behind every entity's 3 CSV endpoints (export/import/template) — Employee,
// Company, and Contact all follow this exact same GET/POST/GET pattern (see csvService.ts).
function buildCsvEndpoints(basePath: string) {
  return {
    export: async (token: string): Promise<string> => {
      const res = await apiFetch(`${API_BASE_URL}${basePath}/export/csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) await throwApiError(res);
      return res.text();
    },
    import: async (token: string, csv: string): Promise<CsvImportResult> => {
      const res = await apiFetch(`${API_BASE_URL}${basePath}/import/csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ csv }),
      });
      if (!res.ok) await throwApiError(res);
      return res.json();
    },
    template: async (token: string): Promise<string> => {
      const res = await apiFetch(`${API_BASE_URL}${basePath}/template/csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) await throwApiError(res);
      return res.text();
    },
  };
}

const employeesCsv = buildCsvEndpoints('/api/hr/employees');
const companiesCsv = buildCsvEndpoints('/api/companies');
const contactsCsv = buildCsvEndpoints('/api/contacts');

export const csvApi = {
  // CSV import/export
  exportEmployeesCsv: employeesCsv.export,
  importEmployeesCsv: employeesCsv.import,
  employeesCsvTemplate: employeesCsv.template,
  exportCompaniesCsv: companiesCsv.export,
  importCompaniesCsv: companiesCsv.import,
  companiesCsvTemplate: companiesCsv.template,
  exportContactsCsv: contactsCsv.export,
  importContactsCsv: contactsCsv.import,
  contactsCsvTemplate: contactsCsv.template,
};
