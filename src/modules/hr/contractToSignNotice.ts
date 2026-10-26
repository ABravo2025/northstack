import prisma from '../../lib/prisma.js';
import type { Employee } from '@prisma/client';
import { sendContractToSignEmail } from '../../lib/mailer.js';
import { buildTenantLogoUrl } from '../tenant/tenantProfileService.js';

// A first contract for a person who already has a login can't go out as an invitation
// (createInvitation refuses "User already belongs to a tenant") — tell them to sign it in the app.
// Used on creation (employeeCompensationService.ts) and on "Resend" (contractPdfService.ts).
export async function sendContractToSignNotice(employee: Pick<Employee, 'tenantId' | 'userId'>, pdfBuffer: Buffer): Promise<{ success: boolean; error?: string }> {
  if (!employee.userId) {
    return { success: false, error: 'This person has no Northstack login' };
  }
  const [user, tenant] = await Promise.all([
    prisma.user.findUnique({ where: { id: employee.userId } }),
    prisma.tenant.findUniqueOrThrow({ where: { id: employee.tenantId } }),
  ]);
  if (!user) {
    return { success: false, error: 'This person has no Northstack login' };
  }
  const appBaseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173';
  await sendContractToSignEmail({
    to: user.email,
    locale: user.locale,
    firstName: user.firstName,
    tenantName: tenant.name,
    logoUrl: buildTenantLogoUrl(tenant.id, tenant.logoUpdatedAt),
    url: `${appBaseUrl}/my-contract`,
    pdfBuffer,
  });
  return { success: true };
}
