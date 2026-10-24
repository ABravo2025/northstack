import prisma from '../../lib/prisma.js';
import { decryptPaymentAccountData, encryptPaymentAccountData } from '../../lib/encryption.js';
import { maskTaxId, personTaxIdKind, personTaxIdRequired, validateTaxId, type TaxIdKind } from '../../lib/taxId.js';

// A person's tax ID (CUIL / SSN / other) — see EmployeeTaxId in schema.prisma and src/lib/taxId.ts.

export type TaxIdSaveResult = { ok: true; masked: string } | { ok: false; error: string };

export async function setEmployeeTaxId(tenantId: string, employeeId: string, raw: unknown, changedByUserId: string): Promise<TaxIdSaveResult> {
  const [tenant, employee] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { country: true } }),
    prisma.employee.findFirst({ where: { id: employeeId, tenantId }, select: { id: true } }),
  ]);
  if (!employee) return { ok: false, error: 'Person not found' };
  const kind = personTaxIdKind(tenant.country);
  const check = validateTaxId(kind, raw);
  if (!check.ok) return check;
  const last4 = check.value.replace(/[^A-Za-z0-9]/g, '').slice(-4);
  const data = { kind, valueEncrypted: encryptPaymentAccountData(check.value), last4, updatedByUserId: changedByUserId };
  await prisma.employeeTaxId.upsert({ where: { employeeId }, create: { tenantId, employeeId, ...data }, update: data });
  return { ok: true, masked: maskTaxId(kind, check.value) };
}

// Checks a value before the person exists (the create route validates first, saves after). Only
// asked when the company has Payroll (Growth) — the payslip is the only thing that uses it, so
// without Payroll it isn't collected at all.
export async function checkTaxIdForTenant(tenantId: string, raw: unknown, personType: unknown, payrollEnabled: boolean): Promise<{ ok: true; provided: boolean } | { ok: false; error: string }> {
  if (!payrollEnabled) return { ok: true, provided: false };
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { country: true } });
  const provided = typeof raw === 'string' && raw.trim() !== '';
  if (!provided) {
    return personTaxIdRequired(tenant.country, typeof personType === 'string' ? personType : null)
      ? { ok: false, error: `${personTaxIdKind(tenant.country).toUpperCase()} is required for employees` }
      : { ok: true, provided: false };
  }
  const check = validateTaxId(personTaxIdKind(tenant.country), raw);
  if (!check.ok) return check;
  // Fails here (missing key) rather than after the person was already created.
  encryptPaymentAccountData(check.value);
  return { ok: true, provided: true };
}

export async function hasEmployeeTaxId(tenantId: string, employeeId: string): Promise<boolean> {
  return (await prisma.employeeTaxId.count({ where: { tenantId, employeeId } })) > 0;
}

// For the payslip: the full value (Argentina prints it) or masked (everywhere else).
export async function taxIdForPayslip(tenantId: string, employeeId: string, full: boolean): Promise<{ kind: TaxIdKind; value: string } | null> {
  const row = await prisma.employeeTaxId.findFirst({ where: { tenantId, employeeId } });
  if (!row) return null;
  const kind = row.kind as TaxIdKind;
  if (!full) return { kind, value: maskTaxId(kind, row.last4) };
  try {
    return { kind, value: decryptPaymentAccountData(row.valueEncrypted) };
  } catch {
    return { kind, value: maskTaxId(kind, row.last4) };
  }
}
