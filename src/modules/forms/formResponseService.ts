import type { Form, FormResponseSource, Prisma } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { decryptAnswers, encryptAnswers } from '../../lib/formsEncryption.js';
import { isValueValidForFieldType, createCustomFieldValue } from '../hr/customFieldService.js';
import { matchOrCreateCompanyForContact } from '../hr/publicFormService.js';
import { createContact } from '../crm/contactService.js';
import { addOpportunityContact, createOpportunity } from '../crm/opportunityService.js';
import { getDefaultStatusId } from '../hr/statusService.js';
import {
  ACTION_CUSTOM_FIELD_ENTITY,
  PERSONAL_ACTIONS,
  mappedValues,
  normalizeAnswers,
  scoreOf,
  type FormAction,
  type FormQuestion,
} from './formDefinitions.js';
import { FormError } from './formService.js';

// Formularios y encuestas (B2): what happens when someone answers. The answers are validated
// against the questions, the form's action runs in its module (only the fields the questions are
// mapped to are ever written), and the response is stored encrypted, linked to the record it
// created or updated. The public page (B3) and personal links (B4) both end up here.

export interface Respondent {
  type: 'contact' | 'employee';
  id: string;
}

export interface SubmitContext {
  source: FormResponseSource;
  respondent?: Respondent | null;
  utm?: { source?: string; medium?: string; campaign?: string };
}

type Linked = { type: string; id: string } | null;
type Values = Map<string, unknown>;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

// Custom-field answers: each "cf:<id>" must be an active definition of this tenant and entity, and
// the value must be valid for its type; anything else is skipped rather than failing the response.
async function writeCustomFields(tenantId: string, entityType: 'contact' | 'employee', entityId: string, values: Values) {
  const ids = [...values.keys()].filter((k) => k.startsWith('cf:')).map((k) => k.slice(3));
  if (!ids.length) return;
  const defs = await prisma.customFieldDefinition.findMany({ where: { id: { in: ids }, tenantId, entityType, isActive: true } });
  for (const def of defs) {
    const raw = values.get(`cf:${def.id}`);
    const value = Array.isArray(raw) ? raw.join(', ') : str(raw);
    if (!value || !isValueValidForFieldType(def.fieldType, value, def.options)) continue;
    const existing = await prisma.customFieldValue.findFirst({
      where: { tenantId, customFieldDefinitionId: def.id, entityType, entityId },
      select: { id: true },
    });
    if (existing) await prisma.customFieldValue.update({ where: { id: existing.id }, data: { value } });
    else await createCustomFieldValue({ tenantId, customFieldDefinitionId: def.id, entityType, entityId, value });
  }
}

async function leadSourceFor(tenantId: string, utmSource?: string) {
  if (!utmSource) return null;
  const match = await prisma.fieldCatalogDefinition.findFirst({
    where: { tenantId, kind: 'leadSource', isActive: true, name: { equals: utmSource, mode: 'insensitive' } },
    select: { id: true },
  });
  return match?.id ?? null;
}

async function createLead(form: Form, values: Values, ctx: SubmitContext): Promise<Linked> {
  const email = str(values.get('contact.email')).toLowerCase();
  const firstName = str(values.get('contact.firstName'));
  const existing = await prisma.contact.findUnique({ where: { tenantId_email: { tenantId: form.tenantId, email } } });
  // A known contact is linked, never overwritten by an anonymous submission.
  if (existing) return { type: 'contact', id: existing.id };

  let companyId: string | null = null;
  const companyName = str(values.get('company.name'));
  if (companyName) {
    const company = await prisma.company.findFirst({
      where: { tenantId: form.tenantId, name: { equals: companyName, mode: 'insensitive' } },
      select: { id: true },
    });
    companyId =
      company?.id ??
      (
        await prisma.company.create({
          data: { tenantId: form.tenantId, name: companyName.slice(0, 200), statusId: await getDefaultStatusId(form.tenantId, 'company') },
        })
      ).id;
  } else {
    companyId = await matchOrCreateCompanyForContact(form.tenantId, email);
  }

  const contact = await createContact({
    tenantId: form.tenantId,
    firstName,
    lastName: str(values.get('contact.lastName')),
    email,
    phone: str(values.get('contact.phone')) || null,
    title: str(values.get('contact.title')) || null,
    companyId,
    leadStatus: 'new',
    leadSourceId: await leadSourceFor(form.tenantId, ctx.utm?.source),
  });
  await writeCustomFields(form.tenantId, 'contact', contact.id, values);

  if (companyId && form.pipelineId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: form.tenantId }, select: { currency: true } });
    const amount = Number(values.get('opportunity.amount'));
    const opportunity = await createOpportunity({
      tenantId: form.tenantId,
      companyId,
      pipelineId: form.pipelineId,
      name: str(values.get('opportunity.name')) || `${firstName} ${str(values.get('contact.lastName'))}`.trim(),
      amountCents: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0,
      currency: tenant?.currency ?? 'USD',
    });
    await addOpportunityContact(form.tenantId, opportunity.id, contact.id);
  }
  return { type: 'contact', id: contact.id };
}

async function respondentContact(tenantId: string, respondent?: Respondent | null) {
  if (respondent?.type !== 'contact') throw new FormError('This form only works from a personal link', 400, 'needs_personal_link');
  const contact = await prisma.contact.findFirst({ where: { id: respondent.id, tenantId } });
  if (!contact) throw new FormError('Contact not found', 404);
  return contact;
}

async function updateContactFromAnswers(form: Form, values: Values, ctx: SubmitContext): Promise<Linked> {
  const contact = await respondentContact(form.tenantId, ctx.respondent);
  const data: Prisma.ContactUpdateInput = {};
  for (const [target, key] of [
    ['contact.firstName', 'firstName'],
    ['contact.lastName', 'lastName'],
    ['contact.phone', 'phone'],
    ['contact.title', 'title'],
  ] as const) {
    const v = str(values.get(target));
    if (v) data[key] = v;
  }
  if (Object.keys(data).length) await prisma.contact.update({ where: { id: contact.id }, data });
  await writeCustomFields(form.tenantId, 'contact', contact.id, values);
  return { type: 'contact', id: contact.id };
}

async function addContactToCompany(form: Form, values: Values, ctx: SubmitContext): Promise<Linked> {
  const by = await respondentContact(form.tenantId, ctx.respondent);
  const email = str(values.get('contact.email')).toLowerCase();
  const existing = await prisma.contact.findUnique({ where: { tenantId_email: { tenantId: form.tenantId, email } } });
  if (existing) return { type: 'contact', id: existing.id };
  const contact = await createContact({
    tenantId: form.tenantId,
    firstName: str(values.get('contact.firstName')),
    lastName: str(values.get('contact.lastName')),
    email,
    phone: str(values.get('contact.phone')) || null,
    title: str(values.get('contact.title')) || null,
    companyId: by.companyId,
  });
  await writeCustomFields(form.tenantId, 'contact', contact.id, values);
  return { type: 'contact', id: contact.id };
}

async function respondentEmployee(tenantId: string, respondent?: Respondent | null) {
  if (respondent?.type !== 'employee') throw new FormError('This form only works from a personal link', 400, 'needs_personal_link');
  const employee = await prisma.employee.findFirst({ where: { id: respondent.id, tenantId }, select: { id: true } });
  if (!employee) throw new FormError('Employee not found', 404);
  return employee;
}

async function updateEmployeeFromAnswers(form: Form, values: Values, ctx: SubmitContext): Promise<Linked> {
  const employee = await respondentEmployee(form.tenantId, ctx.respondent);
  const data: Prisma.EmployeeUpdateInput = {};
  const personalEmail = str(values.get('employee.personalEmail'));
  const nationality = str(values.get('employee.nationality'));
  const birthdate = str(values.get('employee.birthdate'));
  if (personalEmail) data.personalEmail = personalEmail.toLowerCase();
  if (nationality) data.nationality = nationality;
  if (birthdate) data.birthdate = new Date(`${birthdate}T00:00:00Z`);
  if (Object.keys(data).length) await prisma.employee.update({ where: { id: employee.id }, data });
  await writeCustomFields(form.tenantId, 'employee', employee.id, values);
  return { type: 'employee', id: employee.id };
}

async function createTaskFromAnswers(form: Form, values: Values): Promise<Linked> {
  const config = (form.actionConfig ?? {}) as { projectId?: string; phaseId?: string; assigneeId?: string };
  if (!config.projectId || !config.assigneeId) throw new FormError('This form is not set up yet', 409, 'task_not_configured');
  const due = str(values.get('task.dueDate'));
  const task = await prisma.task.create({
    data: {
      tenantId: form.tenantId,
      entityType: 'project',
      entityId: config.projectId,
      projectPhaseId: config.phaseId ?? null,
      title: str(values.get('task.title')).slice(0, 200),
      description: str(values.get('task.description')) || null,
      dueDate: due ? new Date(`${due}T00:00:00Z`) : null,
      assigneeId: config.assigneeId,
      createdById: config.assigneeId,
    },
  });
  return { type: 'task', id: task.id };
}

async function runAction(form: Form, action: FormAction, values: Values, ctx: SubmitContext): Promise<Linked> {
  switch (action) {
    case 'create_lead':
      return createLead(form, values, ctx);
    case 'update_contact':
      return updateContactFromAnswers(form, values, ctx);
    case 'add_contact':
      return addContactToCompany(form, values, ctx);
    case 'update_employee':
      return updateEmployeeFromAnswers(form, values, ctx);
    case 'create_task':
      return createTaskFromAnswers(form, values);
    case 'create_ticket':
      // Customer tickets are their own model, built with the Clientes phase (C7).
      throw new FormError('Support tickets arrive with the Clients module', 409, 'tickets_not_available');
    case 'save_to_file':
    case 'save_only':
      return ctx.respondent ? { type: ctx.respondent.type, id: ctx.respondent.id } : null;
  }
}

export async function submitResponse(form: Form, rawAnswers: Record<string, unknown>, ctx: SubmitContext) {
  const questions = (form.fields as unknown as FormQuestion[] | null) ?? [];
  if (!questions.length || !form.action) throw new FormError('Form not found', 404);
  const action = form.action as FormAction;
  if (PERSONAL_ACTIONS.includes(action) && form.kind === 'form' && !ctx.respondent) {
    throw new FormError('This form only works from a personal link', 400, 'needs_personal_link');
  }
  const checked = normalizeAnswers(questions, rawAnswers);
  if (!checked.ok) throw new FormError('Check the highlighted answer', 400, `invalid_answer:${checked.questionId}`);

  const survey = (form.surveySettings ?? {}) as { anonymous?: boolean };
  const anonymous = form.kind === 'survey' && survey.anonymous === true;
  const values = mappedValues(questions, checked.answers);
  const linked = form.kind === 'survey' ? null : await runAction(form, action, values, ctx);

  // An anonymous survey keeps only the respondent's department (for the 3-answer threshold),
  // never who they are.
  let departmentId: string | null = null;
  if (ctx.respondent?.type === 'employee') {
    const employee = await prisma.employee.findFirst({ where: { id: ctx.respondent.id, tenantId: form.tenantId }, select: { departmentId: true } });
    departmentId = employee?.departmentId ?? null;
  }
  const entity = ACTION_CUSTOM_FIELD_ENTITY[action];
  const copied = linked
    ? questions.filter((q) => q.mapTo && checked.answers[q.id] !== undefined && (!q.mapTo.startsWith('cf:') || entity)).map((q) => ({ questionId: q.id, mapTo: q.mapTo }))
    : [];

  const response = await prisma.formResponse.create({
    data: {
      tenantId: form.tenantId,
      formId: form.id,
      answersEnc: encryptAnswers(checked.answers),
      score: scoreOf(questions, checked.answers),
      source: ctx.source,
      linkedEntityType: anonymous ? null : (linked?.type ?? (form.kind === 'survey' ? (ctx.respondent?.type ?? null) : null)),
      linkedEntityId: anonymous ? null : (linked?.id ?? (form.kind === 'survey' ? (ctx.respondent?.id ?? null) : null)),
      respondentType: anonymous ? null : (ctx.respondent?.type ?? null),
      respondentId: anonymous ? null : (ctx.respondent?.id ?? null),
      departmentId,
      copiedFields: copied as Prisma.InputJsonArray,
      utmSource: ctx.utm?.source?.slice(0, 100) || null,
      utmMedium: ctx.utm?.medium?.slice(0, 100) || null,
      utmCampaign: ctx.utm?.campaign?.slice(0, 100) || null,
    },
  });
  return { responseId: response.id, linked };
}

// --- Reading responses (Respuestas + the modal) --------------------------------------------------

async function linkedLabels(tenantId: string, rows: { linkedEntityType: string | null; linkedEntityId: string | null }[]) {
  const ids = (type: string) => [...new Set(rows.filter((r) => r.linkedEntityType === type && r.linkedEntityId).map((r) => r.linkedEntityId!))];
  const [contacts, employees, tasks] = await Promise.all([
    prisma.contact.findMany({ where: { tenantId, id: { in: ids('contact') } }, select: { id: true, firstName: true, lastName: true, email: true } }),
    prisma.employee.findMany({ where: { tenantId, id: { in: ids('employee') } }, select: { id: true, firstName: true, lastName: true } }),
    prisma.task.findMany({ where: { tenantId, id: { in: ids('task') } }, select: { id: true, title: true, entityId: true } }),
  ]);
  const labels = new Map<string, { label: string; href: string }>();
  for (const c of contacts) labels.set(`contact:${c.id}`, { label: `${c.firstName} ${c.lastName}`.trim() || c.email, href: `/contacts?open=${c.id}` });
  for (const e of employees) labels.set(`employee:${e.id}`, { label: `${e.firstName} ${e.lastName}`.trim(), href: '/hr/people' });
  for (const t of tasks) labels.set(`task:${t.id}`, { label: t.title, href: `/projects/${t.entityId}` });
  return labels;
}

export async function listResponses(tenantId: string, filter: { formId?: string; limit?: number }) {
  const rows = await prisma.formResponse.findMany({
    where: { tenantId, ...(filter.formId ? { formId: filter.formId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(filter.limit ?? 200, 500),
    include: { form: { select: { id: true, name: true, kind: true, module: true, fields: true } } },
  });
  const labels = await linkedLabels(tenantId, rows);
  return rows.map((r) => {
    const questions = (r.form.fields as unknown as FormQuestion[] | null) ?? [];
    const answers = decryptAnswers(r.answersEnc);
    // The list shows the first answered question as a preview; the modal shows them all.
    const first = questions.find((q) => answers[q.id] !== undefined);
    const linked = r.linkedEntityType && r.linkedEntityId ? (labels.get(`${r.linkedEntityType}:${r.linkedEntityId}`) ?? null) : null;
    return {
      id: r.id,
      formId: r.formId,
      formName: r.form.name,
      kind: r.form.kind,
      module: r.form.module,
      score: r.score,
      source: r.source,
      createdAt: r.createdAt,
      preview: first ? formatAnswer(answers[first.id]) : '',
      linked: linked ? { type: r.linkedEntityType!, id: r.linkedEntityId!, ...linked } : null,
    };
  });
}

export async function getResponse(tenantId: string, id: string) {
  const r = await prisma.formResponse.findFirst({
    where: { id, tenantId },
    include: { form: { select: { id: true, name: true, kind: true, module: true, action: true, fields: true } } },
  });
  if (!r) throw new FormError('Response not found', 404);
  const questions = (r.form.fields as unknown as FormQuestion[] | null) ?? [];
  const answers = decryptAnswers(r.answersEnc);
  const copied = new Map(((r.copiedFields as { questionId: string; mapTo: string }[] | null) ?? []).map((c) => [c.questionId, c.mapTo]));
  const labels = await linkedLabels(tenantId, [r]);
  const linked = r.linkedEntityType && r.linkedEntityId ? (labels.get(`${r.linkedEntityType}:${r.linkedEntityId}`) ?? null) : null;
  return {
    id: r.id,
    form: { id: r.form.id, name: r.form.name, kind: r.form.kind, module: r.form.module, action: r.form.action },
    score: r.score,
    source: r.source,
    createdAt: r.createdAt,
    utm: { source: r.utmSource, medium: r.utmMedium, campaign: r.utmCampaign },
    items: questions.map((q) => ({
      questionId: q.id,
      label: q.label,
      type: q.type,
      answer: answers[q.id] === undefined ? null : formatAnswer(answers[q.id]),
      copiedTo: copied.get(q.id) ?? null,
    })),
    linked: linked ? { type: r.linkedEntityType!, id: r.linkedEntityId!, ...linked } : null,
  };
}

function formatAnswer(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return value === undefined || value === null ? '' : String(value);
}
