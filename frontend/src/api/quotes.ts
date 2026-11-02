import { API_BASE_URL, apiFetch, throwApiError } from './http.js';
import type { ProductBilling } from './products.js';

// Cruces D3: quotes built from the product catalog.

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined';

export interface QuoteLineInput {
  productId?: string | null;
  name?: string;
  description?: string | null;
  quantity: number;
  unitPriceCents?: number | null;
  billing?: ProductBilling;
}

export interface Quote {
  id: string;
  number: number;
  status: QuoteStatus;
  currency: string;
  lines: { productId: string | null; name: string; description: string | null; quantity: number; unitPriceCents: number; billing: ProductBilling }[];
  discountPct: number;
  subtotalCents: number;
  totalCents: number;
  notes: string | null;
  validUntil: string;
  sentAt: string | null;
  acceptedAt: string | null;
  acceptedName: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  createdAt: string;
}

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

export const quotesApi = {
  listQuotes: (token: string, opportunityId: string) => call<Quote[]>(token, `/api/opportunities/${opportunityId}/quotes`),
  createQuote: (token: string, input: { opportunityId: string; lines: QuoteLineInput[]; discountPct?: number; notes?: string | null; validDays?: number }) =>
    call<Quote>(token, '/api/quotes', { method: 'POST', body: input }),
  updateQuote: (token: string, id: string, input: { lines?: QuoteLineInput[]; discountPct?: number; notes?: string | null; validDays?: number }) =>
    call<Quote>(token, `/api/quotes/${id}`, { method: 'PATCH', body: input }),
  sendQuote: (token: string, id: string) => call<{ url: string }>(token, `/api/quotes/${id}/send`, { method: 'POST', body: {} }),
  downloadQuotePdf: async (token: string, id: string, lang: 'es' | 'en'): Promise<Blob> => {
    const res = await apiFetch(`${API_BASE_URL}/api/quotes/${id}/pdf?lang=${lang}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) await throwApiError(res);
    return res.blob();
  },
};
