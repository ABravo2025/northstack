import prisma from '../../../lib/prisma.js';

// Shared FK->display-name resolvers for the Tier 1 field configs (employee/company/contact/
// opportunity). Deliberately query Prisma directly instead of going through each entity's own
// service (findEmployeeById, findCompanyById, etc.) — several of these are self-referential
// (Employee.managerId -> Employee) or would otherwise create an import cycle with the very service
// file that imports this field config (e.g. companyService.ts -> companyFieldConfig.ts ->
// resolvers.ts -> companyService.ts). These are plain read-model lookups with no business logic,
// so bypassing the service layer here is safe.

export async function resolveUserName(id: unknown): Promise<string | null> {
  if (typeof id !== 'string') return null;
  const user = await prisma.user.findUnique({ where: { id }, select: { firstName: true, lastName: true } });
  return user ? `${user.firstName} ${user.lastName}` : null;
}

export async function resolveEmployeeName(id: unknown): Promise<string | null> {
  if (typeof id !== 'string') return null;
  const employee = await prisma.employee.findUnique({ where: { id }, select: { firstName: true, lastName: true } });
  return employee ? `${employee.firstName} ${employee.lastName}` : null;
}

export async function resolveStatusName(id: unknown): Promise<string | null> {
  if (typeof id !== 'string') return null;
  const status = await prisma.statusDefinition.findUnique({ where: { id }, select: { name: true } });
  return status?.name ?? null;
}

export async function resolveCatalogName(id: unknown): Promise<string | null> {
  if (typeof id !== 'string') return null;
  const def = await prisma.fieldCatalogDefinition.findUnique({ where: { id }, select: { name: true } });
  return def?.name ?? null;
}

export async function resolveCompanyName(id: unknown): Promise<string | null> {
  if (typeof id !== 'string') return null;
  const company = await prisma.company.findUnique({ where: { id }, select: { name: true } });
  return company?.name ?? null;
}

export async function resolvePipelineName(id: unknown): Promise<string | null> {
  if (typeof id !== 'string') return null;
  const pipeline = await prisma.pipeline.findUnique({ where: { id }, select: { name: true } });
  return pipeline?.name ?? null;
}

export async function resolveStageName(id: unknown): Promise<string | null> {
  if (typeof id !== 'string') return null;
  const stage = await prisma.pipelineStageDefinition.findUnique({ where: { id }, select: { name: true } });
  return stage?.name ?? null;
}

// Needs the sibling `currency` field, which is why FieldChangeResolver receives the full
// before/after record, not just this one value — mirrors frontend/src/lib/currencies.ts's
// formatMoney exactly, so an Opportunity's amount reads identically here and in the app.
export function resolveMoney(cents: unknown, record: Record<string, unknown>): string | null {
  if (typeof cents !== 'number') return null;
  const currency = typeof record.currency === 'string' ? record.currency : 'USD';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export async function resolveTimeOffPolicyName(id: unknown): Promise<string | null> {
  if (typeof id !== 'string') return null;
  const policy = await prisma.timeOffPolicyDefinition.findUnique({ where: { id }, select: { name: true } });
  return policy?.name ?? null;
}

export async function resolvePayFrequencyName(id: unknown): Promise<string | null> {
  if (typeof id !== 'string') return null;
  const freq = await prisma.payFrequencyDefinition.findUnique({ where: { id }, select: { name: true } });
  return freq?.name ?? null;
}

export async function resolvePaymentMethodName(id: unknown): Promise<string | null> {
  if (typeof id !== 'string') return null;
  const method = await prisma.paymentMethodDefinition.findUnique({ where: { id }, select: { name: true } });
  return method?.name ?? null;
}
