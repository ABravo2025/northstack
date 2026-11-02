import type { FormKind, FormModule } from '@prisma/client';

// Formularios y encuestas (spec-clientes-gastos-formularios.md, B2) — the pure rules: which
// question types exist, which actions each module offers, which module fields a question can be
// copied to, and how a definition and a set of answers are validated. No database here.

export const QUESTION_TYPES = [
  'short_text',
  'long_text',
  'email',
  'phone',
  'number',
  'date',
  'select',
  'multi_select',
  'yes_no',
  'rating_nps', // 0-10
  'rating_csat', // 1-5
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface FormQuestion {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  options?: string[];
  help?: string;
  // A field of the form's module ("contact.email", "task.title", "cf:<definitionId>"), or none.
  mapTo?: string | null;
}

export const FORM_ACTIONS = [
  'create_lead',
  'update_contact',
  'add_contact',
  'update_employee',
  'save_to_file',
  'create_ticket',
  'create_task',
  'save_only',
] as const;
export type FormAction = (typeof FORM_ACTIONS)[number];

export const MODULE_ACTIONS: Record<FormModule, FormAction[]> = {
  leads: ['create_lead'],
  clients: ['update_contact', 'add_contact'],
  employees: ['update_employee', 'save_to_file'],
  support: ['create_ticket'],
  projects: ['create_task'],
  none: ['save_only'],
};

// Surveys always store the answer against who was asked (save_to_file / save_only); what they
// feed is the module's score (health, eNPS, loss reasons), not its fields.
export const SURVEY_MODULES: FormModule[] = ['clients', 'employees', 'leads'];

// Actions that know who answers (a personal link) — they never run from an anonymous public link.
export const PERSONAL_ACTIONS: FormAction[] = ['update_contact', 'add_contact', 'update_employee', 'save_to_file'];
// Actions a public link can run.
export const PUBLIC_ACTIONS: FormAction[] = ['create_lead', 'create_ticket', 'create_task', 'save_only'];

// The custom-field entity type each action's "cf:" targets belong to.
export const ACTION_CUSTOM_FIELD_ENTITY: Partial<Record<FormAction, 'contact' | 'employee'>> = {
  create_lead: 'contact',
  update_contact: 'contact',
  add_contact: 'contact',
  update_employee: 'employee',
};

// Core module fields a question can fill, per action. A response never writes anything else.
export const ACTION_TARGETS: Record<FormAction, string[]> = {
  create_lead: ['contact.firstName', 'contact.lastName', 'contact.email', 'contact.phone', 'contact.title', 'company.name', 'opportunity.name', 'opportunity.amount'],
  update_contact: ['contact.firstName', 'contact.lastName', 'contact.phone', 'contact.title'],
  add_contact: ['contact.firstName', 'contact.lastName', 'contact.email', 'contact.phone', 'contact.title'],
  update_employee: ['employee.personalEmail', 'employee.nationality', 'employee.birthdate'],
  save_to_file: [],
  create_ticket: ['ticket.subject', 'ticket.description', 'ticket.email', 'ticket.name'],
  create_task: ['task.title', 'task.description', 'task.dueDate'],
  save_only: [],
};

// Targets that must be mapped for the action to work.
export const REQUIRED_TARGETS: Partial<Record<FormAction, string[]>> = {
  create_lead: ['contact.email', 'contact.firstName'],
  add_contact: ['contact.email', 'contact.firstName'],
  create_ticket: ['ticket.subject'],
  create_task: ['task.title'],
};

// Question types that can feed each kind of target (a date target needs a date question, etc.).
const TARGET_TYPES: Record<string, QuestionType[]> = {
  'contact.email': ['email'],
  'ticket.email': ['email'],
  'employee.personalEmail': ['email'],
  'contact.phone': ['phone', 'short_text'],
  'opportunity.amount': ['number'],
  'employee.birthdate': ['date'],
  'task.dueDate': ['date'],
};
const TEXT_TYPES: QuestionType[] = ['short_text', 'long_text', 'select', 'email', 'phone'];

export function actionsFor(kind: FormKind, module: FormModule): FormAction[] {
  if (kind === 'survey') {
    if (!SURVEY_MODULES.includes(module)) return [];
    return module === 'employees' ? ['save_to_file'] : ['save_only'];
  }
  return MODULE_ACTIONS[module];
}

export interface DefinitionRefs {
  // Active custom field definitions of the tenant, by id → entity type and field type.
  customFields: Map<string, { entityType: string; fieldType: string; options: string[] }>;
}

export interface FormDefinitionInput {
  kind: FormKind;
  module: FormModule;
  action: string;
  fields: FormQuestion[];
}

// Returns the first problem with a definition (as an error key the UI translates), or null.
export function validateDefinition(input: FormDefinitionInput, refs: DefinitionRefs): string | null {
  const allowed = actionsFor(input.kind, input.module);
  if (!allowed.includes(input.action as FormAction)) return 'invalid_action';
  const action = input.action as FormAction;
  if (input.fields.length === 0) return 'no_questions';
  if (input.fields.length > 60) return 'too_many_questions';

  const ids = new Set<string>();
  const mapped = new Set<string>();
  for (const q of input.fields) {
    if (!q.id || ids.has(q.id)) return 'duplicate_question_id';
    ids.add(q.id);
    if (!q.label.trim()) return 'empty_label';
    if (!QUESTION_TYPES.includes(q.type)) return 'invalid_question_type';
    if ((q.type === 'select' || q.type === 'multi_select') && (!q.options || q.options.filter((o) => o.trim()).length < 2)) {
      return 'select_needs_options';
    }
    if (!q.mapTo) continue;
    if (mapped.has(q.mapTo)) return 'target_mapped_twice';
    mapped.add(q.mapTo);
    if (q.mapTo.startsWith('cf:')) {
      const entity = ACTION_CUSTOM_FIELD_ENTITY[action];
      const def = refs.customFields.get(q.mapTo.slice(3));
      // A custom field of another tenant (or another entity) reads as unknown — the defense from the
      // 2026-09-10 security audit, so a public form can never expose someone else's field.
      if (!entity || !def || def.entityType !== entity) return 'invalid_target';
      continue;
    }
    if (!ACTION_TARGETS[action].includes(q.mapTo)) return 'invalid_target';
    const types = TARGET_TYPES[q.mapTo] ?? TEXT_TYPES;
    if (!types.includes(q.type)) return 'target_type_mismatch';
  }
  for (const target of REQUIRED_TARGETS[action] ?? []) {
    if (!mapped.has(target)) return 'missing_required_target';
  }
  if (input.kind === 'survey' && !input.fields.some((q) => q.type === 'rating_nps' || q.type === 'rating_csat')) {
    return 'survey_needs_rating';
  }
  return null;
}

// Cleans a question list coming from a request: trims, drops unknown keys, caps lengths.
export function sanitizeQuestions(raw: unknown): FormQuestion[] | null {
  if (!Array.isArray(raw)) return null;
  const out: FormQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const q = item as Record<string, unknown>;
    const options = Array.isArray(q.options) ? q.options.filter((o): o is string => typeof o === 'string').map((o) => o.trim().slice(0, 120)).filter(Boolean).slice(0, 50) : undefined;
    out.push({
      id: typeof q.id === 'string' ? q.id.slice(0, 40) : '',
      label: typeof q.label === 'string' ? q.label.trim().slice(0, 300) : '',
      type: q.type as QuestionType,
      required: q.required === true,
      ...(options ? { options } : {}),
      ...(typeof q.help === 'string' && q.help.trim() ? { help: q.help.trim().slice(0, 300) } : {}),
      mapTo: typeof q.mapTo === 'string' && q.mapTo ? q.mapTo.slice(0, 80) : null,
    });
  }
  return out;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validates one submission against the questions. Returns the clean answers (only known questions,
// typed) or the id of the first question that fails.
export function normalizeAnswers(
  questions: FormQuestion[],
  raw: Record<string, unknown>,
): { ok: true; answers: Record<string, string | number | boolean | string[]> } | { ok: false; questionId: string } {
  const answers: Record<string, string | number | boolean | string[]> = {};
  for (const q of questions) {
    const value = raw[q.id];
    const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty) {
      if (q.required) return { ok: false, questionId: q.id };
      continue;
    }
    const text = typeof value === 'string' ? value.trim().slice(0, q.type === 'long_text' ? 5000 : 500) : '';
    switch (q.type) {
      case 'email':
        if (!EMAIL.test(text)) return { ok: false, questionId: q.id };
        answers[q.id] = text.toLowerCase();
        break;
      case 'number': {
        const n = typeof value === 'number' ? value : Number(text.replace(',', '.'));
        if (!Number.isFinite(n)) return { ok: false, questionId: q.id };
        answers[q.id] = n;
        break;
      }
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) return { ok: false, questionId: q.id };
        answers[q.id] = text;
        break;
      case 'select':
        if (!q.options?.includes(text)) return { ok: false, questionId: q.id };
        answers[q.id] = text;
        break;
      case 'multi_select': {
        const picked = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
        if (!picked.length || picked.some((p) => !q.options?.includes(p))) return { ok: false, questionId: q.id };
        answers[q.id] = [...new Set(picked)];
        break;
      }
      case 'yes_no':
        if (typeof value !== 'boolean') return { ok: false, questionId: q.id };
        answers[q.id] = value;
        break;
      case 'rating_nps':
      case 'rating_csat': {
        const n = Number(value);
        const [min, max] = q.type === 'rating_nps' ? [0, 10] : [1, 5];
        if (!Number.isInteger(n) || n < min || n > max) return { ok: false, questionId: q.id };
        answers[q.id] = n;
        break;
      }
      default:
        if (!text) {
          if (q.required) return { ok: false, questionId: q.id };
          continue;
        }
        answers[q.id] = text;
    }
  }
  return { ok: true, answers };
}

// The survey's score: the first rating question's answer.
export function scoreOf(questions: FormQuestion[], answers: Record<string, unknown>): number | null {
  const q = questions.find((x) => x.type === 'rating_nps' || x.type === 'rating_csat');
  const v = q ? answers[q.id] : undefined;
  return typeof v === 'number' ? v : null;
}

// The answers keyed by their target: { "contact.email": "ana@x.com", "cf:abc": "..." }.
export function mappedValues(questions: FormQuestion[], answers: Record<string, unknown>): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const q of questions) {
    if (q.mapTo && answers[q.id] !== undefined) out.set(q.mapTo, answers[q.id]);
  }
  return out;
}
