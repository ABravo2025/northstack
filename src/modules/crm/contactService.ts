import prisma from '../../lib/prisma.js';
import { listCustomFieldValuesForEntities } from '../hr/customFieldService.js';
import type { Contact, LeadStatus, Prisma } from '@prisma/client';

export interface CreateContactInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  companyId?: string | null;
  title?: string | null;
  isPrimary?: boolean;
  leadStatus?: LeadStatus | null;
  leadSourceId?: string | null;
  tenantId: string;
}

export interface UpdateContactInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  companyId?: string | null;
  title?: string | null;
  isPrimary?: boolean;
  leadStatus?: LeadStatus | null;
  leadSourceId?: string | null;
}

export async function createContact(input: CreateContactInput): Promise<Contact> {
  return prisma.contact.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone ?? null,
      companyId: input.companyId ?? null,
      title: input.title ?? null,
      isPrimary: input.isPrimary ?? false,
      leadStatus: input.leadStatus ?? null,
      leadSourceId: input.leadSourceId ?? null,
      tenantId: input.tenantId,
    },
  });
}

export async function listContacts(tenantId: string) {
  const contacts = await prisma.contact.findMany({
    where: { tenantId },
    include: {
      company: { select: { id: true, name: true } },
      leadSource: { select: { id: true, name: true } },
    },
  });

  const values = await listCustomFieldValuesForEntities(
    tenantId,
    'contact',
    contacts.map((contact) => contact.id),
  );

  return contacts.map((contact) => ({
    ...contact,
    customFieldVals: values.filter((value) => value.entityId === contact.id),
  }));
}

export async function findContactById(id: string): Promise<Contact | null> {
  return prisma.contact.findUnique({
    where: { id },
  });
}

export async function updateContact(id: string, input: UpdateContactInput): Promise<Contact> {
  // Whitelist explicitly — never pass the input object straight through, since it
  // may originate from req.body and carry extra fields (e.g. tenantId) that would
  // otherwise reassign this row across tenants.
  const data: Prisma.ContactUncheckedUpdateInput = {};
  if (input.firstName !== undefined) data.firstName = input.firstName;
  if (input.lastName !== undefined) data.lastName = input.lastName;
  if (input.email !== undefined) data.email = input.email;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.companyId !== undefined) data.companyId = input.companyId;
  if (input.title !== undefined) data.title = input.title;
  if (input.isPrimary !== undefined) data.isPrimary = input.isPrimary;
  if (input.leadStatus !== undefined) data.leadStatus = input.leadStatus;
  if (input.leadSourceId !== undefined) data.leadSourceId = input.leadSourceId;

  return prisma.contact.update({
    where: { id },
    data,
    include: {
      company: { select: { id: true, name: true } },
      leadSource: { select: { id: true, name: true } },
    },
  });
}

export async function deleteContact(id: string): Promise<void> {
  await prisma.contact.delete({
    where: { id },
  });
}
