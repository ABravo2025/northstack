import prisma from '../../lib/prisma.js';
import { getDefaultStatusId } from '../hr/statusService.js';
import { listCustomFieldValuesForEntities } from '../hr/customFieldService.js';
import type { Company, Prisma } from '@prisma/client';

export interface CreateCompanyInput {
  name: string;
  industry?: string | null;
  website?: string | null;
  phone?: string | null;
  billingAddress?: string | null;
  size?: string | null;
  accountOwnerId?: string | null;
  statusId?: string;
  tenantId: string;
}

// statusId deliberately excluded — Company.status is derived from business
// events (Opportunity reaching a `won` stage, future Contract expiry), never
// edited directly. Keeping it out of the whitelist enforces that at the
// service layer too, not just by omitting a control in the UI.
export interface UpdateCompanyInput {
  name?: string;
  industry?: string | null;
  website?: string | null;
  phone?: string | null;
  billingAddress?: string | null;
  size?: string | null;
  accountOwnerId?: string | null;
}

export async function createCompany(input: CreateCompanyInput): Promise<Company> {
  const statusId = input.statusId ?? (await getDefaultStatusId(input.tenantId, 'company'));

  return prisma.company.create({
    data: {
      name: input.name,
      industry: input.industry ?? null,
      website: input.website ?? null,
      phone: input.phone ?? null,
      billingAddress: input.billingAddress ?? null,
      size: input.size ?? null,
      accountOwnerId: input.accountOwnerId ?? null,
      statusId,
      tenantId: input.tenantId,
    },
  });
}

export async function listCompanies(tenantId: string) {
  const companies = await prisma.company.findMany({
    where: { tenantId },
    include: {
      statusDefn: true,
      accountOwner: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const values = await listCustomFieldValuesForEntities(
    tenantId,
    'company',
    companies.map((company) => company.id),
  );

  return companies.map((company) => ({
    ...company,
    customFieldVals: values.filter((value) => value.entityId === company.id),
  }));
}

export async function findCompanyById(id: string): Promise<Company | null> {
  return prisma.company.findUnique({
    where: { id },
  });
}

export async function updateCompany(id: string, input: UpdateCompanyInput): Promise<Company> {
  // Whitelist explicitly — never pass the input object straight through, since it
  // may originate from req.body and carry extra fields (e.g. tenantId/statusId)
  // that would otherwise reassign this row across tenants or bypass the
  // no-manual-status-edit rule above.
  const data: Prisma.CompanyUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.industry !== undefined) data.industry = input.industry;
  if (input.website !== undefined) data.website = input.website;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.billingAddress !== undefined) data.billingAddress = input.billingAddress;
  if (input.size !== undefined) data.size = input.size;
  if (input.accountOwnerId !== undefined) data.accountOwnerId = input.accountOwnerId;

  return prisma.company.update({
    where: { id },
    data,
    include: {
      statusDefn: true,
      accountOwner: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

export interface DeleteCompanyResult {
  success: boolean;
  error?: string;
}

// Unlike Client (no children today), a Company can have Contacts/Opportunities
// hanging off it — deleting it out from under them would orphan real pipeline
// data, so this guards instead of relying on a DB-level cascade.
export async function deleteCompany(id: string): Promise<DeleteCompanyResult> {
  const [contactCount, opportunityCount] = await Promise.all([
    prisma.contact.count({ where: { companyId: id } }),
    prisma.opportunity.count({ where: { companyId: id } }),
  ]);

  if (contactCount > 0 || opportunityCount > 0) {
    return { success: false, error: 'Cannot delete a company with existing contacts or opportunities' };
  }

  await prisma.company.delete({ where: { id } });
  return { success: true };
}
