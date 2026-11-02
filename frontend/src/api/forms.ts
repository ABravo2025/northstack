import { API_BASE_URL, apiFetch, throwApiError } from './http.js';

// Formularios y encuestas (spec-clientes-gastos-formularios.md, Fase B). Response routes answer 503
// with code "forms_not_configured" until FORMS_DATA_ENCRYPTION_KEY is set on the server.

export type FormKind = 'form' | 'survey';
export type FormModule = 'leads' | 'clients' | 'employees' | 'support' | 'projects' | 'none';
export type FormStatus = 'draft' | 'published';
export type FormAction =
  | 'create_lead'
  | 'update_contact'
  | 'add_contact'
  | 'update_employee'
  | 'save_to_file'
  | 'create_ticket'
  | 'create_task'
  | 'save_only';
export type QuestionType =
  | 'short_text'
  | 'long_text'
  | 'email'
  | 'phone'
  | 'number'
  | 'date'
  | 'select'
  | 'multi_select'
  | 'yes_no'
  | 'rating_nps'
  | 'rating_csat';

export interface FormQuestion {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  options?: string[];
  help?: string;
  mapTo?: string | null;
}

export interface SurveySettings {
  metric?: 'nps' | 'csat' | 'enps' | 'none';
  trigger?: string;
  anonymous?: boolean;
  minAnonymousGroup?: number;
  countsTowardHealth?: boolean;
}

export interface FormDefinition {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  kind: FormKind;
  module: FormModule;
  action: FormAction | null;
  legacy: boolean;
  entityType: string | null;
  fields: FormQuestion[];
  status: FormStatus;
  isActive: boolean;
  pipelineId: string | null;
  actionConfig: { projectId?: string; phaseId?: string; assigneeId?: string } | null;
  allowedDomains: string[];
  afterSubmit: { mode: 'message' | 'redirect'; message?: string; redirectUrl?: string } | null;
  embedSettings: { style?: 'inline' | 'button' | 'popup'; buttonLabel?: string } | null;
  surveySettings: SurveySettings | null;
  responseCount: number;
  createdAt: string;
  updatedAt: string;
}

export type FormInput = Partial<
  Pick<
    FormDefinition,
    | 'name'
    | 'slug'
    | 'description'
    | 'kind'
    | 'module'
    | 'action'
    | 'fields'
    | 'status'
    | 'pipelineId'
    | 'actionConfig'
    | 'allowedDomains'
    | 'afterSubmit'
    | 'embedSettings'
    | 'surveySettings'
  >
>;

export interface FormsMeta {
  tenantSlug: string | null;
  targets: Record<FormAction, string[]>;
  customFields: { id: string; name: string; entityType: 'contact' | 'employee'; fieldType: string }[];
  pipelines: { id: string; name: string }[];
  projects: { id: string; name: string; phases: { id: string; name: string }[] }[];
  users: { id: string; name: string }[];
  encryptionConfigured: boolean;
}

export interface FormLinked {
  type: string;
  id: string;
  label: string;
  href: string;
}

export interface FormResponseRow {
  id: string;
  formId: string;
  formName: string;
  kind: FormKind;
  module: FormModule;
  score: number | null;
  source: string;
  createdAt: string;
  preview: string;
  linked: FormLinked | null;
}

export interface FormResponseDetail {
  id: string;
  form: { id: string; name: string; kind: FormKind; module: FormModule; action: FormAction | null };
  score: number | null;
  source: string;
  createdAt: string;
  utm: { source: string | null; medium: string | null; campaign: string | null };
  items: { questionId: string; label: string; type: QuestionType; answer: string | null; copiedTo: string | null }[];
  linked: FormLinked | null;
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
  return res.status === 204 ? (undefined as T) : res.json();
}

export const formsApi = {
  getFormsMeta: (token: string) => call<FormsMeta>(token, '/api/forms/meta'),
  listForms: (token: string) => call<FormDefinition[]>(token, '/api/forms'),
  getForm: (token: string, id: string) => call<FormDefinition>(token, `/api/forms/${id}`),
  createForm: (token: string, input: FormInput) => call<FormDefinition>(token, '/api/forms', { method: 'POST', body: input }),
  updateForm: (token: string, id: string, input: FormInput) => call<FormDefinition>(token, `/api/forms/${id}`, { method: 'PATCH', body: input }),
  deleteForm: (token: string, id: string) => call<void>(token, `/api/forms/${id}`, { method: 'DELETE' }),
  listFormResponses: (token: string, formId?: string) =>
    call<FormResponseRow[]>(token, `/api/forms/responses${formId ? `?formId=${encodeURIComponent(formId)}` : ''}`),
  getFormResponse: (token: string, id: string) => call<FormResponseDetail>(token, `/api/forms/responses/${id}`),
};
