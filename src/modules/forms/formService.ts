import type { Form, FormKind, FormModule, FormStatus, Prisma } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import {
  ACTION_TARGETS,
  actionsFor,
  sanitizeQuestions,
  validateDefinition,
  type FormAction,
  type FormQuestion,
} from './formDefinitions.js';

// Formularios y encuestas (spec-clientes-gastos-formularios.md, B2): the builder's backend.
// Every lookup is scoped by tenantId first; ids that come in (pipeline, project, assignee, custom
// fields) must belong to the tenant before they're saved.

export class FormError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string,
  ) {
    super(message);
  }
}

const KINDS: FormKind[] = ['form', 'survey'];
const MODULES: FormModule[] = ['leads', 'clients', 'employees', 'support', 'projects', 'none'];

export function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// Hostnames only ("acme.com", "*.acme.com"), lower-cased, no scheme/path. Used for CSP
// frame-ancestors (B3), so anything that isn't clearly a hostname is dropped.
export function sanitizeDomains(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const host = item.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (/^(\*\.)?([a-z0-9-]+\.)+[a-z]{2,}$/.test(host) || host === 'localhost') out.add(host);
  }
  return [...out].slice(0, 20);
}

function sanitizeAfterSubmit(raw: unknown): Prisma.InputJsonObject | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.mode === 'redirect' && typeof r.redirectUrl === 'string' && /^https:\/\/[^\s]+$/.test(r.redirectUrl)) {
    return { mode: 'redirect', redirectUrl: r.redirectUrl.slice(0, 500) };
  }
  const message = typeof r.message === 'string' ? r.message.trim().slice(0, 1000) : '';
  return { mode: 'message', ...(message ? { message } : {}) };
}

function sanitizeEmbed(raw: unknown): Prisma.InputJsonObject | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const style = r.style === 'button' || r.style === 'popup' ? r.style : 'inline';
  const buttonLabel = typeof r.buttonLabel === 'string' ? r.buttonLabel.trim().slice(0, 40) : '';
  return { style, ...(buttonLabel ? { buttonLabel } : {}) };
}

const SURVEY_METRICS = ['nps', 'csat', 'enps', 'none'];
const SURVEY_TRIGGERS: Record<string, string[]> = {
  clients: ['manual', 'onboarding_done', 'ticket_closed', 'every_90_days'],
  employees: ['manual', 'quarterly', '30_days_after_hire', 'offboarding'],
  leads: ['manual', 'opportunity_lost'],
};

function sanitizeSurvey(raw: unknown, module: FormModule): Prisma.InputJsonObject | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const metric = SURVEY_METRICS.includes(r.metric as string) ? (r.metric as string) : 'none';
  const triggers = SURVEY_TRIGGERS[module] ?? ['manual'];
  const trigger = triggers.includes(r.trigger as string) ? (r.trigger as string) : 'manual';
  // Employee surveys are anonymous by default; at least 3 answers per department before a
  // department's results are shown (spec).
  const anonymous = module === 'employees' ? r.anonymous !== false : r.anonymous === true;
  const minAnonymousGroup = Math.min(Math.max(Number(r.minAnonymousGroup) || 3, 3), 20);
  return {
    metric,
    trigger,
    anonymous,
    minAnonymousGroup,
    countsTowardHealth: module === 'clients' && r.countsTowardHealth !== false,
  };
}

export interface FormInput {
  name?: string;
  slug?: string;
  description?: string | null;
  kind?: unknown;
  module?: unknown;
  action?: unknown;
  fields?: unknown;
  status?: unknown;
  pipelineId?: string | null;
  actionConfig?: unknown;
  allowedDomains?: unknown;
  afterSubmit?: unknown;
  embedSettings?: unknown;
  surveySettings?: unknown;
}

async function customFieldRefs(tenantId: string) {
  const defs = await prisma.customFieldDefinition.findMany({
    where: { tenantId, isActive: true, entityType: { in: ['contact', 'employee'] } },
    select: { id: true, entityType: true, fieldType: true, options: true },
  });
  return new Map(
    defs.map((d) => {
      let options: string[] = [];
      try {
        options = d.options ? JSON.parse(d.options) : [];
      } catch {
        options = [];
      }
      return [d.id, { entityType: d.entityType, fieldType: d.fieldType, options }];
    }),
  );
}

async function sanitizeActionConfig(tenantId: string, action: FormAction, raw: unknown): Promise<Prisma.InputJsonObject | null> {
  if (action !== 'create_task') return null;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const projectId = typeof r.projectId === 'string' ? r.projectId : '';
  const assigneeId = typeof r.assigneeId === 'string' ? r.assigneeId : '';
  const phaseId = typeof r.phaseId === 'string' && r.phaseId ? r.phaseId : null;
  const [project, assignee, phase] = await Promise.all([
    projectId ? prisma.project.findFirst({ where: { id: projectId, tenantId }, select: { id: true } }) : null,
    assigneeId ? prisma.user.findFirst({ where: { id: assigneeId, tenantId }, select: { id: true } }) : null,
    phaseId ? prisma.projectPhase.findFirst({ where: { id: phaseId, tenantId, projectId }, select: { id: true } }) : null,
  ]);
  if (!project) throw new FormError('Choose the project the tasks go to', 400, 'task_needs_project');
  if (!assignee) throw new FormError('Choose who the tasks are assigned to', 400, 'task_needs_assignee');
  if (phaseId && !phase) throw new FormError('Phase not found', 404);
  return { projectId, assigneeId, ...(phaseId ? { phaseId } : {}) };
}

// Builds the full write for create/update from a request body, validating everything together.
async function buildWrite(tenantId: string, input: FormInput, existing: Form | null) {
  const kind = (input.kind ?? existing?.kind ?? 'form') as FormKind;
  const module = (input.module ?? existing?.module ?? 'none') as FormModule;
  if (!KINDS.includes(kind)) throw new FormError('Invalid type', 400, 'invalid_kind');
  if (!MODULES.includes(module)) throw new FormError('Invalid module', 400, 'invalid_module');
  const action = (input.action ?? existing?.action ?? actionsFor(kind, module)[0]) as FormAction;
  const fields =
    input.fields !== undefined ? sanitizeQuestions(input.fields) : ((existing?.fields as unknown as FormQuestion[] | null) ?? []);
  if (!fields) throw new FormError('Invalid questions', 400, 'invalid_questions');

  const problem = validateDefinition({ kind, module, action, fields }, { customFields: await customFieldRefs(tenantId) });
  if (problem) throw new FormError('The form definition is not valid', 400, problem);

  let pipelineId = input.pipelineId !== undefined ? input.pipelineId : (existing?.pipelineId ?? null);
  if (action !== 'create_lead') pipelineId = null;
  if (pipelineId) {
    const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId }, select: { id: true } });
    if (!pipeline) throw new FormError('Pipeline not found', 404);
  }
  const actionConfig = await sanitizeActionConfig(tenantId, action, input.actionConfig ?? existing?.actionConfig);
  const status = (input.status ?? existing?.status ?? 'draft') as FormStatus;
  if (status !== 'draft' && status !== 'published') throw new FormError('Invalid status', 400);

  return {
    kind,
    module,
    action,
    fields: fields as unknown as Prisma.InputJsonArray,
    status,
    pipelineId,
    actionConfig: actionConfig ?? undefined,
    surveySettings: kind === 'survey' ? (sanitizeSurvey(input.surveySettings ?? existing?.surveySettings, module) ?? undefined) : undefined,
    ...(input.allowedDomains !== undefined ? { allowedDomains: sanitizeDomains(input.allowedDomains) } : {}),
    ...(input.afterSubmit !== undefined ? { afterSubmit: sanitizeAfterSubmit(input.afterSubmit) ?? undefined } : {}),
    ...(input.embedSettings !== undefined ? { embedSettings: sanitizeEmbed(input.embedSettings) ?? undefined } : {}),
    ...(input.description !== undefined ? { description: input.description?.trim().slice(0, 1000) || null } : {}),
  };
}

function present(form: Form & { _count?: { responses: number } }) {
  return {
    id: form.id,
    name: form.name,
    slug: form.slug,
    description: form.description,
    kind: form.kind,
    module: form.module,
    action: form.action,
    // Pre-Fase B forms (the old public-forms page, removed 2026-11-02) answer nowhere until they're
    // rebuilt here with questions.
    legacy: form.fields === null,
    entityType: form.entityType,
    fields: (form.fields as unknown as FormQuestion[] | null) ?? [],
    status: form.status,
    isActive: form.isActive,
    pipelineId: form.pipelineId,
    actionConfig: form.actionConfig,
    allowedDomains: form.allowedDomains,
    afterSubmit: form.afterSubmit,
    embedSettings: form.embedSettings,
    surveySettings: form.surveySettings,
    responseCount: form._count?.responses ?? 0,
    createdAt: form.createdAt,
    updatedAt: form.updatedAt,
  };
}

export type FormView = ReturnType<typeof present>;

export async function listForms(tenantId: string, filter: { kind?: FormKind; module?: FormModule } = {}) {
  const rows = await prisma.form.findMany({
    where: { tenantId, ...(filter.kind ? { kind: filter.kind } : {}), ...(filter.module ? { module: filter.module } : {}) },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { responses: true } } },
  });
  return rows.map(present);
}

export async function getForm(tenantId: string, id: string) {
  const form = await prisma.form.findFirst({ where: { id, tenantId }, include: { _count: { select: { responses: true } } } });
  if (!form) throw new FormError('Form not found', 404);
  return present(form);
}

async function uniqueSlug(tenantId: string, wanted: string, exceptId?: string) {
  const base = normalizeSlug(wanted) || 'form';
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const clash = await prisma.form.findFirst({ where: { tenantId, slug, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (!clash) return slug;
  }
  throw new FormError('Choose another link name', 409, 'slug_taken');
}

export async function createForm(tenantId: string, input: FormInput) {
  const name = input.name?.trim().slice(0, 120);
  if (!name) throw new FormError('Name is required', 400, 'name_required');
  const write = await buildWrite(tenantId, input, null);
  const form = await prisma.form.create({
    data: {
      tenantId,
      name,
      slug: await uniqueSlug(tenantId, input.slug || name),
      fieldsConfig: '[]',
      accessMode: 'public',
      ...write,
    },
  });
  return present(form);
}

export async function updateForm(tenantId: string, id: string, input: FormInput) {
  const existing = await prisma.form.findFirst({ where: { id, tenantId } });
  if (!existing) throw new FormError('Form not found', 404);
  if (existing.fields === null && input.fields === undefined) {
    throw new FormError('Rebuild this form with the new editor before changing it', 409, 'legacy_form');
  }
  const write = await buildWrite(tenantId, input, existing);
  const name = input.name !== undefined ? input.name.trim().slice(0, 120) : undefined;
  if (name === '') throw new FormError('Name is required', 400, 'name_required');
  const form = await prisma.form.update({
    where: { id },
    data: {
      ...write,
      ...(name ? { name } : {}),
      ...(input.slug !== undefined ? { slug: await uniqueSlug(tenantId, input.slug, id) } : {}),
      // A legacy form rebuilt here leaves its old entity-based behaviour behind.
      ...(existing.fields === null ? { entityType: null } : {}),
    },
    include: { _count: { select: { responses: true } } },
  });
  return present(form);
}

// Only a form nobody answered can be deleted; one with responses is unpublished instead, so no
// answer (and what it created) loses its form.
export async function deleteForm(tenantId: string, id: string) {
  const form = await prisma.form.findFirst({ where: { id, tenantId }, include: { _count: { select: { responses: true } } } });
  if (!form) throw new FormError('Form not found', 404);
  if (form._count.responses > 0) throw new FormError('This form has responses: unpublish it instead', 409, 'has_responses');
  await prisma.form.delete({ where: { id } });
}

// What the editor needs to offer: actions per module, the module fields each action can fill
// (core + the tenant's custom fields), pipelines, projects and people to assign tasks to.
export async function getFormsMeta(tenantId: string) {
  const [customFields, pipelines, projects, users, tenant] = await Promise.all([
    prisma.customFieldDefinition.findMany({
      where: { tenantId, isActive: true, entityType: { in: ['contact', 'employee'] } },
      select: { id: true, name: true, entityType: true, fieldType: true },
      orderBy: { name: 'asc' },
    }),
    prisma.pipeline.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.project.findMany({
      where: { tenantId, status: { notIn: ['completed', 'cancelled'] } },
      select: { id: true, name: true, phases: { select: { id: true, name: true }, orderBy: { order: 'asc' } } },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({ where: { tenantId, status: 'active' }, select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: 'asc' } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
  ]);
  return {
    tenantSlug: tenant?.slug ?? null,
    targets: ACTION_TARGETS,
    customFields,
    pipelines,
    projects,
    users: users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() })),
  };
}
