import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import prisma from '../../lib/prisma.js';
import type { EmployeeCompensation } from '@prisma/client';
import { createInvitation } from '../tenant/invitationService.js';
import { sendInvitationEmail, sendContractSignedEmail } from '../../lib/mailer.js';

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amountCents / 100);
}

export interface RenderContractPdfInput {
  tenantName: string;
  employeeName: string;
  nationality: string | null;
  jobTitle: string;
  description: string;
  compensationType: 'hourly' | 'fixed';
  rateCents: number;
  currency: string;
  payFrequencyName: string;
  effectiveFrom: Date;
  signed: boolean;
  confirmedAt?: Date | null;
  confirmedIp?: string | null;
}

// Same one-column, no-frills approach as payslipService.ts's renderPayslipPdf
// — this is a snapshot of the terms already shown as plain HTML on
// /confirm-contract, not a lawyer-drafted document. Generated twice per
// contract: once as a draft right when it's created (Unidad 5/6), and again
// — overwriting the same EmployeeCompensation.contractPdf column — once
// signed (Unidad 7), at which point it also carries the confirmation
// evidence (date/time/IP) that's otherwise only in the DB.
export async function renderContractPdf(input: RenderContractPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 740;
  const drawText = (text: string, size = 11, useBold = false, color = rgb(0, 0, 0)) => {
    page.drawText(text, { x: 50, y, size, font: useBold ? boldFont : font, color });
    y -= size + 10;
  };

  if (input.signed) {
    drawText('SIGNED', 10, true, rgb(0.05, 0.45, 0.2));
  } else {
    drawText('DRAFT — PENDING SIGNATURE', 10, true, rgb(0.7, 0.15, 0.15));
  }
  y -= 8;
  drawText(input.tenantName, 18, true);
  drawText(`Contract — ${input.employeeName}`, 12);
  y -= 16;

  drawText('Terms', 12, true);
  drawText(`Job Title: ${input.jobTitle}`);
  drawText(`Role Description: ${input.description}`);
  drawText(`Compensation Type: ${input.compensationType === 'hourly' ? 'Hourly' : 'Fixed'}`);
  drawText(`Rate: ${formatMoney(input.rateCents, input.currency)}`);
  drawText(`Pay Frequency: ${input.payFrequencyName}`);
  drawText(`Effective From: ${input.effectiveFrom.toISOString().slice(0, 10)}`);
  if (input.nationality) {
    drawText(`Nationality: ${input.nationality}`);
  }
  y -= 10;

  if (input.signed && input.confirmedAt) {
    drawText('Confirmation', 12, true);
    drawText(`Signed on: ${input.confirmedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC`);
    if (input.confirmedIp) {
      drawText(`IP address: ${input.confirmedIp}`);
    }
    y -= 10;
  }

  drawText(
    'This document is a record of the terms above, not a lawyer-drafted legal contract — no',
    9,
    false,
    rgb(0.45, 0.45, 0.45),
  );
  drawText('document numbering or country-specific compliance.', 9, false, rgb(0.45, 0.45, 0.45));

  return doc.save();
}

// The one compensation row a "view contract" / "resend contract" action
// should act on: the currently open one if there is one, otherwise the most
// recent — mirrors how getCompensationStatus/computeContractStatus pick
// which contract represents "the" contract for a person with a history of
// several.
async function findRelevantCompensation(tenantId: string, employeeId: string): Promise<EmployeeCompensation | null> {
  const open = await prisma.employeeCompensation.findFirst({
    where: { tenantId, employeeId, effectiveTo: null },
    orderBy: { createdAt: 'desc' },
  });
  if (open) return open;
  return prisma.employeeCompensation.findFirst({
    where: { tenantId, employeeId },
    orderBy: { createdAt: 'desc' },
  });
}

export interface EmployeeCompensationSummary {
  compensationType: 'hourly' | 'fixed';
  rateCents: number;
  currency: string;
  payFrequencyName: string;
  jobTitle: string;
  description: string;
  effectiveFrom: string;
  note: string | null;
  confirmedAt: string | null;
  hasContractPdf: boolean;
}

// The read model behind the "Compensation" section of the People overview
// panel (2026-08-08, user feedback: the contract data entered at alta was
// never shown anywhere afterward except inside the generated PDF) — safe to
// expose as-is, deliberately excludes paymentAccountDataEncrypted and the
// raw contractPdf bytes (those stay behind their own owner-gated endpoints).
export async function getEmployeeCompensationSummary(
  tenantId: string,
  employeeId: string,
): Promise<{ success: boolean; summary?: EmployeeCompensationSummary; error?: string }> {
  const compensation = await prisma.employeeCompensation.findFirst({
    where: { tenantId, employeeId, effectiveTo: null },
    include: { payFrequency: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!compensation) {
    return { success: false, error: 'This person has no active compensation' };
  }
  return {
    success: true,
    summary: {
      compensationType: compensation.compensationType,
      rateCents: compensation.rateCents,
      currency: compensation.currency,
      payFrequencyName: compensation.payFrequency.name,
      jobTitle: compensation.jobTitle,
      description: compensation.description,
      effectiveFrom: compensation.effectiveFrom.toISOString(),
      note: compensation.note,
      confirmedAt: compensation.confirmedAt ? compensation.confirmedAt.toISOString() : null,
      hasContractPdf: Boolean(compensation.contractPdf),
    },
  };
}

export interface ContractPdfResult {
  success: boolean;
  pdfBytes?: Uint8Array;
  error?: string;
}

export async function getEmployeeContractPdf(tenantId: string, employeeId: string): Promise<ContractPdfResult> {
  const compensation = await findRelevantCompensation(tenantId, employeeId);
  if (!compensation) {
    return { success: false, error: 'This person has no contract yet' };
  }
  if (!compensation.contractPdf) {
    return { success: false, error: 'No contract document stored for this person' };
  }
  return { success: true, pdfBytes: compensation.contractPdf };
}

export interface ResendContractResult {
  success: boolean;
  error?: string;
}

// Manual "it didn't arrive" escape hatch (2026-08-08 user feedback) — resends
// whatever the current state actually is, it never re-generates the PDF
// (that only happens at creation/confirmation): the draft + a live
// invitation link if still unsigned, or the signed copy (to the signer, cc
// owner + whoever created the contract) if already confirmed.
export async function resendEmployeeContract(tenantId: string, employeeId: string, actingUserId: string): Promise<ResendContractResult> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.tenantId !== tenantId) {
    return { success: false, error: 'Employee not found' };
  }

  const compensation = await findRelevantCompensation(tenantId, employeeId);
  if (!compensation) {
    return { success: false, error: 'This person has no contract yet' };
  }
  if (!compensation.contractPdf) {
    return { success: false, error: 'No contract document stored for this person' };
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const pdfBuffer = Buffer.from(compensation.contractPdf);

  if (!compensation.confirmedAt) {
    // Still unsigned — resend the invitation link + draft attachment. Reuse
    // the existing pending invitation if it's still valid, otherwise issue a
    // fresh one (the old token stays in the DB, simply superseded).
    const pending = await prisma.invitation.findFirst({
      where: { tenantId, employeeId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });

    const appBaseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173';
    let token = pending && pending.expiresAt > new Date() ? pending.token : null;

    if (!token) {
      const created = await createInvitation({
        tenantId,
        invitedByUserId: actingUserId,
        email: employee.email,
        role: 'member',
        employeeId: employee.id,
        acceptPath: '/confirm-contract',
      });
      if (!created.success || !created.invitation) {
        return { success: false, error: created.error || 'Failed to create a new invitation' };
      }
      // createInvitation already sent the email (with no attachment, since
      // it doesn't know about the stored PDF) — send the real one below
      // instead of relying on that fire-and-forget copy.
      token = created.invitation.token;
    }

    await sendInvitationEmail({
      to: employee.email,
      tenantName: tenant.name,
      role: 'member',
      acceptUrl: `${appBaseUrl}/confirm-contract/${token}`,
      attachments: [{ filename: 'contract-draft.pdf', content: pdfBuffer }],
    });
    return { success: true };
  }

  // Already signed — resend the final copy to the signer, cc'd the same way
  // as the original send-on-confirmation.
  if (!employee.userId) {
    return { success: false, error: 'Signed contract has no linked user to send it to' };
  }
  const signer = await prisma.user.findUnique({ where: { id: employee.userId } });
  if (!signer) {
    return { success: false, error: 'Signed contract has no linked user to send it to' };
  }

  const [owner, creator] = await Promise.all([
    prisma.user.findFirst({ where: { tenantId, role: 'owner' } }),
    prisma.user.findUnique({ where: { id: compensation.createdByUserId } }),
  ]);
  const cc = [...new Set([owner?.email, creator?.email].filter((e): e is string => Boolean(e) && e !== signer.email))];

  await sendContractSignedEmail({
    to: signer.email,
    cc,
    tenantName: tenant.name,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    pdfBuffer,
  });
  return { success: true };
}
