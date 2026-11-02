import { randomUUID } from 'node:crypto';
import type { PipelinePurpose, PipelineStageOutcome, PipelineType } from '@prisma/client';

// Clientes C1 (spec-clientes-gastos-formularios.md): the pure rules for a stage's exit checklist and
// entry automations, and the three pipeline templates. Pipelines stay 100% customizable — templates
// are only a starting point, and every checklist item and automation is optional and editable.

export interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
}

export type StageAutomation =
  | { id: string; type: 'create_task'; title: string; dueInDays: number }
  | { id: string; type: 'send_survey'; formId: string };

export const MAX_CHECKLIST_ITEMS = 15;
export const MAX_AUTOMATIONS = 5;

const shortId = () => randomUUID().slice(0, 8);

export function sanitizeChecklist(raw: unknown): ChecklistItem[] | null {
  if (raw === null) return [];
  if (!Array.isArray(raw)) return null;
  const out: ChecklistItem[] = [];
  for (const item of raw.slice(0, MAX_CHECKLIST_ITEMS)) {
    if (!item || typeof item !== 'object') return null;
    const r = item as Record<string, unknown>;
    const label = typeof r.label === 'string' ? r.label.trim().slice(0, 200) : '';
    if (!label) continue;
    out.push({ id: typeof r.id === 'string' && /^[\w-]{1,40}$/.test(r.id) ? r.id : shortId(), label, required: r.required !== false });
  }
  return out;
}

export function sanitizeAutomations(raw: unknown): StageAutomation[] | null {
  if (raw === null) return [];
  if (!Array.isArray(raw)) return null;
  const out: StageAutomation[] = [];
  for (const item of raw.slice(0, MAX_AUTOMATIONS)) {
    if (!item || typeof item !== 'object') return null;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === 'string' && /^[\w-]{1,40}$/.test(r.id) ? r.id : shortId();
    if (r.type === 'create_task') {
      const title = typeof r.title === 'string' ? r.title.trim().slice(0, 200) : '';
      if (!title) continue;
      const due = Number(r.dueInDays);
      out.push({ id, type: 'create_task', title, dueInDays: Number.isInteger(due) && due >= 0 && due <= 365 ? due : 0 });
    } else if (r.type === 'send_survey' && typeof r.formId === 'string' && r.formId) {
      out.push({ id, type: 'send_survey', formId: r.formId });
    } else {
      return null;
    }
  }
  return out;
}

export function readChecklist(value: unknown): ChecklistItem[] {
  return sanitizeChecklist(value ?? []) ?? [];
}

export function readAutomations(value: unknown): StageAutomation[] {
  return sanitizeAutomations(value ?? []) ?? [];
}

export type ChecklistState = Record<string, string[]>;

export function readChecklistState(value: unknown): ChecklistState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: ChecklistState = {};
  for (const [stageId, ids] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(ids)) out[stageId] = ids.filter((x): x is string => typeof x === 'string');
  }
  return out;
}

// A move "forward" is the only one the checklist can block: to a later open stage, or to won.
// Going back, or closing as lost, is always allowed — a lost deal shouldn't need its paperwork.
export function isForwardMove(
  from: { order: number; outcome: PipelineStageOutcome },
  to: { order: number; outcome: PipelineStageOutcome },
): boolean {
  if (to.outcome === 'lost') return false;
  if (to.outcome === 'won') return from.outcome !== 'won';
  return to.order > from.order;
}

export function missingRequired(checklist: ChecklistItem[], done: string[] | undefined): ChecklistItem[] {
  const ticked = new Set(done ?? []);
  return checklist.filter((i) => i.required && !ticked.has(i.id));
}

// --- Templates -------------------------------------------------------------------------------------

export type TemplateKey = 'new_business' | 'expansion' | 'renewal';
export const TEMPLATE_KEYS: TemplateKey[] = ['new_business', 'expansion', 'renewal'];

interface TemplateStage {
  name: string;
  outcome: PipelineStageOutcome;
  probability: number;
  checklist?: string[];
  tasks?: { title: string; dueInDays: number }[];
}

interface Template {
  name: string;
  type: PipelineType;
  purpose: PipelinePurpose;
  stalledThresholdDays: number;
  stages: TemplateStage[];
}

// Names are written in the company's language once, as data: after that they're the company's own
// labels, renamed like any other (we never translate what the user can edit).
const TEMPLATES: Record<'es' | 'en', Record<TemplateKey, Template>> = {
  es: {
    new_business: {
      name: 'Nuevo negocio',
      type: 'lead',
      purpose: 'new_business',
      stalledThresholdDays: 14,
      stages: [
        { name: 'Calificado', outcome: 'open', probability: 20, checklist: ['Necesidad confirmada', 'Presupuesto conversado', 'Decisor identificado'] },
        { name: 'Reunión / demo', outcome: 'open', probability: 40, tasks: [{ title: 'Preparar la demo', dueInDays: 2 }], checklist: ['Demo hecha'] },
        { name: 'Propuesta', outcome: 'open', probability: 60, tasks: [{ title: 'Enviar la propuesta', dueInDays: 1 }], checklist: ['Propuesta enviada'] },
        { name: 'Negociación', outcome: 'open', probability: 80, checklist: ['Condiciones acordadas'] },
        { name: 'Ganada', outcome: 'won', probability: 100 },
        { name: 'Perdida', outcome: 'lost', probability: 0 },
      ],
    },
    expansion: {
      name: 'Expansión',
      type: 'account',
      purpose: 'expansion',
      stalledThresholdDays: 21,
      stages: [
        { name: 'Oportunidad detectada', outcome: 'open', probability: 20 },
        { name: 'Conversación con el cliente', outcome: 'open', probability: 40, tasks: [{ title: 'Agendar la conversación', dueInDays: 3 }] },
        { name: 'Propuesta', outcome: 'open', probability: 70, checklist: ['Propuesta enviada'] },
        { name: 'Ganada', outcome: 'won', probability: 100 },
        { name: 'Perdida', outcome: 'lost', probability: 0 },
      ],
    },
    renewal: {
      name: 'Renovaciones',
      type: 'account',
      purpose: 'renewal',
      stalledThresholdDays: 14,
      stages: [
        { name: 'Por renovar (90 días)', outcome: 'open', probability: 60, tasks: [{ title: 'Revisar el uso y la salud de la cuenta', dueInDays: 7 }] },
        { name: 'Conversación de renovación', outcome: 'open', probability: 75, checklist: ['Condiciones conversadas'] },
        { name: 'Renovación enviada', outcome: 'open', probability: 90, checklist: ['Renovación enviada'] },
        { name: 'Renovada', outcome: 'won', probability: 100 },
        { name: 'No renovó', outcome: 'lost', probability: 0 },
      ],
    },
  },
  en: {
    new_business: {
      name: 'New business',
      type: 'lead',
      purpose: 'new_business',
      stalledThresholdDays: 14,
      stages: [
        { name: 'Qualified', outcome: 'open', probability: 20, checklist: ['Need confirmed', 'Budget discussed', 'Decision maker identified'] },
        { name: 'Meeting / demo', outcome: 'open', probability: 40, tasks: [{ title: 'Prepare the demo', dueInDays: 2 }], checklist: ['Demo done'] },
        { name: 'Proposal', outcome: 'open', probability: 60, tasks: [{ title: 'Send the proposal', dueInDays: 1 }], checklist: ['Proposal sent'] },
        { name: 'Negotiation', outcome: 'open', probability: 80, checklist: ['Terms agreed'] },
        { name: 'Won', outcome: 'won', probability: 100 },
        { name: 'Lost', outcome: 'lost', probability: 0 },
      ],
    },
    expansion: {
      name: 'Expansion',
      type: 'account',
      purpose: 'expansion',
      stalledThresholdDays: 21,
      stages: [
        { name: 'Opportunity spotted', outcome: 'open', probability: 20 },
        { name: 'Conversation with the client', outcome: 'open', probability: 40, tasks: [{ title: 'Schedule the conversation', dueInDays: 3 }] },
        { name: 'Proposal', outcome: 'open', probability: 70, checklist: ['Proposal sent'] },
        { name: 'Won', outcome: 'won', probability: 100 },
        { name: 'Lost', outcome: 'lost', probability: 0 },
      ],
    },
    renewal: {
      name: 'Renewals',
      type: 'account',
      purpose: 'renewal',
      stalledThresholdDays: 14,
      stages: [
        { name: 'Up for renewal (90 days)', outcome: 'open', probability: 60, tasks: [{ title: 'Review account usage and health', dueInDays: 7 }] },
        { name: 'Renewal conversation', outcome: 'open', probability: 75, checklist: ['Terms discussed'] },
        { name: 'Renewal sent', outcome: 'open', probability: 90, checklist: ['Renewal sent'] },
        { name: 'Renewed', outcome: 'won', probability: 100 },
        { name: "Didn't renew", outcome: 'lost', probability: 0 },
      ],
    },
  },
};

export function buildTemplate(key: TemplateKey, lang: 'es' | 'en') {
  const t = TEMPLATES[lang][key];
  return {
    name: t.name,
    type: t.type,
    purpose: t.purpose,
    stalledThresholdDays: t.stalledThresholdDays,
    stages: t.stages.map((s, order) => ({
      name: s.name,
      order,
      outcome: s.outcome,
      probability: s.probability,
      exitChecklist: (s.checklist ?? []).map((label) => ({ id: shortId(), label, required: true })),
      enterAutomations: (s.tasks ?? []).map((task) => ({ id: shortId(), type: 'create_task' as const, title: task.title, dueInDays: task.dueInDays })),
    })),
  };
}
