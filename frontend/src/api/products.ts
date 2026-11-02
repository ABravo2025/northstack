import { API_BASE_URL, apiFetch, throwApiError } from './http.js';

// Clientes C4: the product catalog and each company's products.

export type ProductBilling = 'one_time' | 'monthly' | 'yearly';

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  unitPriceCents: number;
  currency: string;
  billing: ProductBilling;
  isActive: boolean;
  activeAccounts?: number;
}

export interface CompanyProductLine {
  id: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  startDate: string;
  renewalDate: string | null;
  cancelledAt: string | null;
  notes: string | null;
  product: { id: string; name: string; billing: ProductBilling; currency: string; unitPriceCents: number };
}

export interface CompanyProductsView {
  lines: CompanyProductLine[];
  whiteSpace: Product[];
  mrr: { currency: string; cents: number }[];
}

export interface CompanyTimelineEvent {
  at: string;
  kind:
    | 'opportunity_created'
    | 'stage_changed'
    | 'won'
    | 'lost'
    | 'handoff'
    | 'lead_converted'
    | 'product_added'
    | 'product_cancelled'
    | 'note'
    | 'task_done'
    | 'survey_answered';
  title: string;
  detail?: string | null;
  href?: string | null;
}

export interface CompanyOnboardingProject {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  ownerEmployee: { firstName: string; lastName: string } | null;
  isOnboarding: boolean;
  tasks: number;
  tasksDone: number;
}

export type ProductInput = Partial<Pick<Product, 'name' | 'sku' | 'description' | 'unitPriceCents' | 'currency' | 'billing' | 'isActive'>>;

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
  return res.json();
}

export const productsApi = {
  listProducts: (token: string) => call<Product[]>(token, '/api/products'),
  createProduct: (token: string, input: ProductInput) => call<Product>(token, '/api/products', { method: 'POST', body: input }),
  updateProduct: (token: string, id: string, input: ProductInput) => call<Product>(token, `/api/products/${id}`, { method: 'PATCH', body: input }),
  getCompanyProducts: (token: string, companyId: string) => call<CompanyProductsView>(token, `/api/companies/${companyId}/products`),
  addCompanyProduct: (
    token: string,
    companyId: string,
    input: { productId: string; quantity?: number; unitPriceCents?: number; startDate?: string; renewalDate?: string | null; notes?: string | null },
  ) => call<CompanyProductLine>(token, `/api/companies/${companyId}/products`, { method: 'POST', body: input }),
  updateCompanyProduct: (
    token: string,
    companyId: string,
    lineId: string,
    input: { quantity?: number; unitPriceCents?: number; renewalDate?: string | null; notes?: string | null; cancelled?: boolean },
  ) => call<CompanyProductLine>(token, `/api/companies/${companyId}/products/${lineId}`, { method: 'PATCH', body: input }),
  // Clientes C5: the company 360 view.
  getCompanyTimeline: (token: string, companyId: string) => call<CompanyTimelineEvent[]>(token, `/api/companies/${companyId}/timeline`),
  getCompanyOnboarding: (token: string, companyId: string) => call<CompanyOnboardingProject[]>(token, `/api/companies/${companyId}/onboarding`),
};
