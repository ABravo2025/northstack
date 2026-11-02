import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type {
  ExpenseAccount,
  ExpenseAccountType,
  ExpenseCategory,
  ExpenseDirection,
  ExpenseImportProfile,
  ExpenseImportResult,
  ExpenseImportRowInput,
  ExpenseImportRowPlan,
  ExpenseKind,
  ExpenseMovement,
  ExpensesDashboard,
  CashflowProjection,
  ExpenseInsights,
  ExpensesMeta,
  ExpensesSummary,
  FixedExpense,
  FixedPaymentMethod,
} from './types.js';

// Gastos / Expenses (spec-clientes-gastos-formularios.md, Fase A). Every route answers 503 with
// code "expenses_not_configured" until EXPENSES_DATA_ENCRYPTION_KEY is set on the server.
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
  return res.status === 204 ? (undefined as T) : res.json();
}

export interface MovementFilter {
  period?: string;
  accountId?: string;
  kind?: ExpenseKind;
  q?: string;
}

export interface FixedExpenseInput {
  name: string;
  amount: string;
  dayOfMonth: number;
  paymentMethod: FixedPaymentMethod;
  accountId: string;
  categoryId: string | null;
  departmentId: string | null;
}

export const expensesApi = {
  getExpensesMeta: (token: string) => call<ExpensesMeta>(token, '/api/expenses/meta'),

  getExpensesSummary: (token: string, period?: string) =>
    call<ExpensesSummary>(token, `/api/expenses/summary${period ? `?period=${period}` : ''}`),

  createExpenseAccount: (token: string, input: { name: string; type: ExpenseAccountType }) =>
    call<ExpenseAccount>(token, '/api/expenses/accounts', { method: 'POST', body: input }),

  updateExpenseAccount: (token: string, id: string, input: { name?: string; type?: ExpenseAccountType; isActive?: boolean }) =>
    call<ExpenseAccount>(token, `/api/expenses/accounts/${id}`, { method: 'PATCH', body: input }),

  createExpenseCategory: (token: string, name: string) =>
    call<ExpenseCategory>(token, '/api/expenses/categories', { method: 'POST', body: { name } }),

  listExpenseMovements: (token: string, filter: MovementFilter = {}) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filter)) if (v) params.set(k, v);
    const qs = params.toString();
    return call<ExpenseMovement[]>(token, `/api/expenses/movements${qs ? `?${qs}` : ''}`);
  },

  createExpenseMovement: (
    token: string,
    input: {
      accountId: string;
      date: string;
      description: string;
      amount: string;
      direction: ExpenseDirection;
      categoryId: string | null;
      departmentId: string | null;
      companyId?: string | null;
      note?: string;
      currency?: string;
      rate?: string;
    },
  ) => call<ExpenseMovement>(token, '/api/expenses/movements', { method: 'POST', body: input }),

  updateExpenseMovement: (
    token: string,
    id: string,
    input: { categoryId?: string | null; departmentId?: string | null; companyId?: string | null; kind?: ExpenseKind; note?: string | null; learnRule?: boolean },
  ) => call<{ movement: ExpenseMovement; appliedToOthers: number }>(token, `/api/expenses/movements/${id}`, { method: 'PATCH', body: input }),

  deleteExpenseMovement: (token: string, id: string) => call<void>(token, `/api/expenses/movements/${id}`, { method: 'DELETE' }),

  listFixedExpenses: (token: string, period?: string) =>
    call<FixedExpense[]>(token, `/api/expenses/fixed${period ? `?period=${period}` : ''}`),

  createFixedExpense: (token: string, input: FixedExpenseInput) =>
    call<FixedExpense>(token, '/api/expenses/fixed', { method: 'POST', body: input }),

  updateFixedExpense: (token: string, id: string, input: Partial<FixedExpenseInput> & { isActive?: boolean }) =>
    call<FixedExpense>(token, `/api/expenses/fixed/${id}`, { method: 'PATCH', body: input }),

  payFixedExpense: (token: string, id: string, input: { period: string; date?: string; amount?: string }) =>
    call<FixedExpense>(token, `/api/expenses/fixed/${id}/pay`, { method: 'POST', body: input }),

  // Dashboards → Gastos (A7). departmentId "none" = movements with no department.
  getExpensesDashboard: (token: string, filter: { from: string; to: string; departmentId?: string }) => {
    const qs = new URLSearchParams({ from: filter.from, to: filter.to, ...(filter.departmentId ? { departmentId: filter.departmentId } : {}) });
    return call<ExpensesDashboard>(token, `/api/expenses/dashboard?${qs}`);
  },

  // CSV import (A4/A6): rows are parsed and normalized in the browser; the file never leaves it.
  previewExpenseImport: (token: string, accountId: string, rows: ExpenseImportRowInput[]) =>
    call<{ rows: ExpenseImportRowPlan[] }>(token, '/api/expenses/import/preview', { method: 'POST', body: { accountId, rows } }),

  importExpenses: (
    token: string,
    input: { accountId: string; rows: ExpenseImportRowInput[]; profile: ExpenseImportProfile; saveProfile: boolean },
  ) => call<ExpenseImportResult>(token, '/api/expenses/import', { method: 'POST', body: input }),

  // Cruces D2: the next 13 weeks of cash. The opening balance is sent, never stored.
  getCashflow: (token: string, opening?: string) =>
    call<CashflowProjection>(token, `/api/expenses/cashflow${opening ? `?opening=${encodeURIComponent(opening)}` : ''}`),

  // Cruces D4: budgets, subscription suggestions, fixed-expense increases.
  getExpenseInsights: (token: string, period: string) => call<ExpenseInsights>(token, `/api/expenses/insights?period=${period}`),
  setExpenseCategoryBudget: (token: string, categoryId: string, budget: string | null) =>
    call<void>(token, `/api/expenses/categories/${categoryId}/budget`, { method: 'PUT', body: { budget } }),

  // Cruces D4: receipts (encrypted on the server).
  uploadExpenseReceipt: (token: string, movementId: string, input: { fileName: string; mimeType: string; data: string }) =>
    call<{ id: string; mimeType: string; sizeBytes: number }>(token, `/api/expenses/movements/${movementId}/receipt`, { method: 'PUT', body: input }),
  downloadExpenseReceipt: async (token: string, movementId: string): Promise<Blob> => {
    const res = await apiFetch(`${API_BASE_URL}/api/expenses/movements/${movementId}/receipt`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) await throwApiError(res);
    return res.blob();
  },
  deleteExpenseReceipt: (token: string, movementId: string) => call<void>(token, `/api/expenses/movements/${movementId}/receipt`, { method: 'DELETE' }),
};
