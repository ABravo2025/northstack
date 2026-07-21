import prisma from '../../lib/prisma.js';
import { createEmployee } from './employeeService.js';
import { createClient } from '../clients/clientService.js';
import { createCustomFieldValue, isValueValidForFieldType } from './customFieldService.js';
import { sendPublicFormConfirmationEmail, sendPublicFormSubmissionEmail } from '../../lib/mailer.js';
import type { EntityType, PublicForm } from '@prisma/client';

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
  form?: PublicForm;
  error?: string;
}

export async function createPublicForm(input: CreatePublicFormInput): Promise<CreatePublicFormResult> {
  const slug = normalizeSlug(input.slug);
  if (!slug) {
    return { success: false, error: 'Slug is required' };
  }

  const existing = await prisma.publicForm.findUnique({
    where: { tenantId_slug: { tenantId: input.tenantId, slug } },
  });
  if (existing) {
    return { success: false, error: 'A form with this slug already exists' };
  }

  const form = await prisma.publicForm.create({
    data: {
      tenantId: input.tenantId,
      entityType: input.entityType,
      name: input.name,
      slug,
      fieldsConfig: JSON.stringify(input.fields),
    },
  });
  return { success: true, form };
}

export async function listPublicForms(tenantId: string): Promise<PublicForm[]> {
  return prisma.publicForm.findMany({
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
}

export interface UpdatePublicFormResult {
  success: boolean;
  form?: PublicForm;
  error?: string;
}

export async function updatePublicForm(
  id: string,
  tenantId: string,
  input: UpdatePublicFormInput,
): Promise<UpdatePublicFormResult> {
  const existing = await prisma.publicForm.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    return { success: false, error: 'Form not found' };
  }

  const form = await prisma.publicForm.update({
    where: { id },
    data: {
      name: input.name,
      isActive: input.isActive,
      fieldsConfig: input.fields ? JSON.stringify(input.fields) : undefined,
    },
  });
  return { success: true, form };
}

// Public lookup — no tenant/auth context, only the two slugs from the URL.
export async function findActivePublicForm(tenantSlug: string, formSlug: string): Promise<PublicForm | null> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    return null;
  }
  const form = await prisma.publicForm.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug: formSlug } },
  });
  if (!form || !form.isActive) {
    return null;
  }
  return form;
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
  form: PublicForm,
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

  // Employee.email is stored lowercased (see createEmployee); Client.email is stored as-is.
  const trimmedEmail = input.email.trim();
  const emailTaken =
    form.entityType === 'employee'
      ? await prisma.employee.findUnique({
          where: { tenantId_email: { tenantId: form.tenantId, email: trimmedEmail.toLowerCase() } },
        })
      : await prisma.client.findUnique({
          where: { tenantId_email: { tenantId: form.tenantId, email: trimmedEmail } },
        });
  if (emailTaken) {
    return { success: false, error: 'This email has already been submitted' };
  }

  let entityId: string;

  if (form.entityType === 'employee') {
    const employee = await createEmployee({
      tenantId: form.tenantId,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim(),
      department: input.values['department'] ?? '',
    });
    entityId = employee.id;
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
