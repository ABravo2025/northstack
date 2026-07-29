import prisma from '../../lib/prisma.js';
import { createEmployee } from './employeeService.js';
import { createClient } from '../clients/clientService.js';
import { createContact } from '../crm/contactService.js';
import { addOpportunityContact, createOpportunity } from '../crm/opportunityService.js';
import { getDefaultStatusId } from './statusService.js';
import { createCustomFieldValue, isValueValidForFieldType } from './customFieldService.js';
import { GENERIC_EMAIL_DOMAINS, getEmailDomain } from '../tenant/tenantService.js';
import { sendPublicFormConfirmationEmail, sendPublicFormSubmissionEmail } from '../../lib/mailer.js';
import type { EntityType, Form, FormAccessMode } from '@prisma/client';

export interface PublicFormFieldConfig {
  key: string; // 'department' | 'company' | `cf:${customFieldDefinitionId}`
  required: boolean;
}

export interface CreatePublicFormInput {
  tenantId: string;
  entityType: EntityType;
  name: string;
  slug: string;
  fields: PublicFormFieldConfig[];
  thankYouMessage?: string;
  accessMode?: FormAccessMode;
  pipelineId?: string | null; // contact forms only — which Pipeline the auto-created Opportunity lands in
}

function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface CreatePublicFormResult {
  success: boolean;
  form?: Form;
  error?: string;
}

export async function createPublicForm(input: CreatePublicFormInput): Promise<CreatePublicFormResult> {
  const slug = normalizeSlug(input.slug);
  if (!slug) {
    return { success: false, error: 'Slug is required' };
  }

  const existing = await prisma.form.findUnique({
    where: { tenantId_slug: { tenantId: input.tenantId, slug } },
  });
  if (existing) {
    return { success: false, error: 'A form with this slug already exists' };
  }

  const form = await prisma.form.create({
    data: {
      tenantId: input.tenantId,
      entityType: input.entityType,
      name: input.name,
      slug,
      fieldsConfig: JSON.stringify(input.fields),
      thankYouMessage: input.thankYouMessage?.trim() || null,
      accessMode: input.accessMode ?? 'public',
      pipelineId: input.entityType === 'contact' ? (input.pipelineId ?? null) : null,
    },
  });
  return { success: true, form };
}

export async function listPublicForms(tenantId: string): Promise<Form[]> {
  return prisma.form.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getTenantSlug(tenantId: string): Promise<string | null> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  return tenant?.slug ?? null;
}

export interface UpdatePublicFormInput {
  name?: string;
  fields?: PublicFormFieldConfig[];
  isActive?: boolean;
  thankYouMessage?: string;
  pipelineId?: string | null;
}

export interface UpdatePublicFormResult {
  success: boolean;
  form?: Form;
  error?: string;
}

export async function updatePublicForm(
  id: string,
  tenantId: string,
  input: UpdatePublicFormInput,
): Promise<UpdatePublicFormResult> {
  const existing = await prisma.form.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    return { success: false, error: 'Form not found' };
  }

  const form = await prisma.form.update({
    where: { id },
    data: {
      name: input.name,
      isActive: input.isActive,
      fieldsConfig: input.fields ? JSON.stringify(input.fields) : undefined,
      thankYouMessage: input.thankYouMessage !== undefined ? input.thankYouMessage.trim() || null : undefined,
      pipelineId: input.pipelineId !== undefined ? input.pipelineId : undefined,
    },
  });
  return { success: true, form };
}

// Public lookup — no tenant/auth context, only the two slugs from the URL.
export async function findActivePublicForm(tenantSlug: string, formSlug: string): Promise<Form | null> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    return null;
  }
  const form = await prisma.form.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug: formSlug } },
  });
  // accessMode:'internal' forms are meant to be filled by a logged-in team
  // member, not an anonymous visitor — there's no authenticated submission
  // path built yet, so failing closed here (never served on the anonymous
  // /apply route) is the safe behavior until that exists, rather than
  // exposing an internal-only form to the public because the gate was only
  // half-built.
  if (!form || !form.isActive || form.accessMode !== 'public') {
    return null;
  }
  return form;
}

// Matching criterion (spec's open question, resolved): match by an existing
// Contact at this tenant sharing the submitter's email domain who's already
// linked to a Company — reuse that Company. Generic/free email domains
// (gmail.com, etc. — same list tenant registration already excludes for its
// own duplicate-domain check) never match or create a Company: there's no
// reliable signal there, so the Contact is created without one instead (spec
// item 9, "calificación de leads sin volumen" — this is that fallback,
// already needed here even though full lead-qualification-at-volume tooling
// is explicitly out of scope for this tier). Deliberately never touches an
// existing Company's fields when matched — only reuses its id — so a
// public submission can't silently overwrite real CRM data.
async function matchOrCreateCompanyForContact(tenantId: string, email: string): Promise<string | null> {
  const domain = getEmailDomain(email);
  if (!domain || GENERIC_EMAIL_DOMAINS.has(domain)) {
    return null;
  }

  const existingContactSameDomain = await prisma.contact.findFirst({
    where: { tenantId, companyId: { not: null }, email: { endsWith: `@${domain}` } },
    select: { companyId: true },
  });
  if (existingContactSameDomain?.companyId) {
    return existingContactSameDomain.companyId;
  }

  const statusId = await getDefaultStatusId(tenantId, 'company');
  const domainName = domain.split('.')[0];
  const companyName = domainName.charAt(0).toUpperCase() + domainName.slice(1);
  const company = await prisma.company.create({ data: { tenantId, name: companyName, statusId } });
  return company.id;
}

export interface SubmitPublicFormInput {
  firstName: string;
  lastName: string;
  email: string;
  values: Record<string, string>; // keyed by the same 'department'/'company'/`cf:${id}` keys as fieldsConfig
}

export interface SubmitPublicFormResult {
  success: boolean;
  error?: string;
}

export async function submitPublicForm(
  form: Form,
  input: SubmitPublicFormInput,
): Promise<SubmitPublicFormResult> {
  if (!input.firstName.trim() || !input.lastName.trim() || !input.email.trim()) {
    return { success: false, error: 'First name, last name and email are required' };
  }

  const fields: PublicFormFieldConfig[] = JSON.parse(form.fieldsConfig);
  const customFieldKeys = fields.filter((f) => f.key.startsWith('cf:'));

  for (const field of fields) {
    if (field.required && !(input.values[field.key] ?? '').trim()) {
      return { success: false, error: `Missing required field: ${field.key}` };
    }
  }

  // Employee.email is stored lowercased (see createEmployee); Client/Contact.email is stored as-is.
  const trimmedEmail = input.email.trim();
  const emailTaken =
    form.entityType === 'employee'
      ? await prisma.employee.findUnique({
          where: { tenantId_email: { tenantId: form.tenantId, email: trimmedEmail.toLowerCase() } },
        })
      : form.entityType === 'contact'
        ? await prisma.contact.findUnique({
            where: { tenantId_email: { tenantId: form.tenantId, email: trimmedEmail } },
          })
        : await prisma.client.findUnique({
            where: { tenantId_email: { tenantId: form.tenantId, email: trimmedEmail } },
          });
  if (emailTaken) {
    return { success: false, error: 'This email has already been submitted' };
  }

  let entityId: string;

  if (form.entityType === 'employee') {
    // 'department' is a dropdown of the tenant's existing catalog options (see
    // fieldCatalogService.ts) — the submitted value is a FieldCatalogDefinition id,
    // not free text. Validate it belongs to this tenant before trusting it; an
    // invalid/stale id is silently dropped rather than failing the whole submit,
    // same as the custom-field validation below.
    const submittedDepartmentId = input.values['department']?.trim();
    let departmentId: string | undefined;
    if (submittedDepartmentId) {
      const department = await prisma.fieldCatalogDefinition.findUnique({ where: { id: submittedDepartmentId } });
      if (department && department.tenantId === form.tenantId && department.kind === 'department' && department.isActive) {
        departmentId = department.id;
      }
    }

    const employee = await createEmployee({
      tenantId: form.tenantId,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim(),
      departmentId,
    });
    entityId = employee.id;
  } else if (form.entityType === 'contact') {
    const companyId = await matchOrCreateCompanyForContact(form.tenantId, trimmedEmail);

    const contact = await createContact({
      tenantId: form.tenantId,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: trimmedEmail,
      companyId,
      leadStatus: 'new',
    });
    entityId = contact.id;

    // Opportunity creation needs a matched Company (required FK) and a
    // Pipeline configured on the form. ownerId is a required field with no
    // "unassigned" option in the schema — defaulting new inbound deals to
    // the tenant owner is just satisfying that constraint, not the
    // auto-assignment *rule engine* the spec explicitly deferred as an
    // "automatización" (that's about picking an owner by e.g. territory/
    // round-robin — a fixed fallback to a single, always-valid user isn't
    // that).
    if (companyId && form.pipelineId) {
      const firstStage = await prisma.pipelineStageDefinition.findFirst({
        where: { pipelineId: form.pipelineId, isActive: true },
        orderBy: { order: 'asc' },
      });
      const owner = await prisma.user.findFirst({ where: { tenantId: form.tenantId, role: 'owner' } });
      const tenant = await prisma.tenant.findUnique({ where: { id: form.tenantId }, select: { currency: true } });
      if (firstStage && owner) {
        const opportunity = await createOpportunity({
          tenantId: form.tenantId,
          companyId,
          pipelineId: form.pipelineId,
          stageId: firstStage.id,
          name: `${input.firstName.trim()} ${input.lastName.trim()} — inbound`,
          amountCents: 0,
          currency: tenant?.currency ?? 'USD',
          ownerId: owner.id,
        });
        await addOpportunityContact(form.tenantId, opportunity.id, contact.id);
      }
    }
  } else {
    const client = await createClient({
      tenantId: form.tenantId,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim(),
      company: input.values['company'] ?? '',
    });
    entityId = client.id;
  }

  for (const field of customFieldKeys) {
    const definitionId = field.key.slice('cf:'.length);
    const rawValue = (input.values[field.key] ?? '').trim();
    if (!rawValue) {
      continue;
    }

    const definition = await prisma.customFieldDefinition.findUnique({ where: { id: definitionId } });
    if (!definition || definition.tenantId !== form.tenantId || definition.entityType !== form.entityType) {
      continue;
    }
    if (!isValueValidForFieldType(definition.fieldType, rawValue, definition.options)) {
      continue;
    }

    await createCustomFieldValue({
      tenantId: form.tenantId,
      customFieldDefinitionId: definitionId,
      entityType: form.entityType,
      entityId,
      value: rawValue,
    });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: form.tenantId }, select: { name: true } });
  const tenantName = tenant?.name ?? 'the team';
  const submitterName = `${input.firstName.trim()} ${input.lastName.trim()}`;
  const admins = await prisma.user.findMany({
    where: { tenantId: form.tenantId, role: { in: ['owner', 'admin'] } },
    select: { email: true },
  });

  for (const admin of admins) {
    sendPublicFormSubmissionEmail({
      to: admin.email,
      tenantName,
      formName: form.name,
      submitterName,
      submitterEmail: trimmedEmail,
    }).catch((err) => console.error('Failed to send public form submission email:', err));
  }
  sendPublicFormConfirmationEmail({ to: trimmedEmail, tenantName, formName: form.name }).catch((err) =>
    console.error('Failed to send public form confirmation email:', err),
  );

  return { success: true };
}
