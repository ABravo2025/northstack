import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import prisma from '../../lib/prisma.js';

const ENTRY_TYPE_LABELS: Record<string, string> = {
  base: 'Base pay',
  bonus: 'Bonus',
  commission: 'Commission',
  reimbursement: 'Reimbursement',
  deduction: 'Deduction',
};

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amountCents / 100);
}

export interface PayslipResult {
  success: boolean;
  pdfBytes?: Uint8Array;
  error?: string;
}

// Unidad 20 — a simple preview PDF from a PayrollEntry or the set of entries
// a person has within a run. Deliberately not a legal document: no numbering,
// no signature, no country-specific compliance — marked as a preview on the
// PDF itself, not just in the UI around it.
async function renderPayslipPdf(input: {
  tenantName: string;
  employeeName: string;
  periodLabel: string;
  currency: string;
  lines: { label: string; amountCents: number }[];
  totalCents: number;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 740;
  const drawText = (text: string, size = 11, useBold = false, color = rgb(0, 0, 0)) => {
    page.drawText(text, { x: 50, y, size, font: useBold ? boldFont : font, color });
    y -= size + 10;
  };

  drawText('PREVIEW — NOT ISSUED', 10, true, rgb(0.7, 0.15, 0.15));
  y -= 8;
  drawText(input.tenantName, 18, true);
  drawText(`Payslip preview — ${input.employeeName}`, 12);
  drawText(`Period: ${input.periodLabel}`, 11, false, rgb(0.35, 0.35, 0.35));
  y -= 16;

  drawText('Breakdown', 12, true);
  for (const line of input.lines) {
    drawText(`${line.label}: ${formatMoney(line.amountCents, input.currency)}`);
  }
  y -= 10;
  drawText(`Total: ${formatMoney(input.totalCents, input.currency)}`, 14, true);
  y -= 24;
  drawText(
    'This is a preview only, not a legal payslip. No document numbering, no signature, no country-specific',
    9,
    false,
    rgb(0.45, 0.45, 0.45),
  );
  drawText('payroll compliance.', 9, false, rgb(0.45, 0.45, 0.45));

  return doc.save();
}

export async function buildPayslipForRunEmployee(
  tenantId: string,
  runId: string,
  employeeId: string,
): Promise<PayslipResult> {
  const run = await prisma.payrollRun.findUnique({ where: { id: runId } });
  if (!run || run.tenantId !== tenantId) {
    return { success: false, error: 'Run not found' };
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.tenantId !== tenantId) {
    return { success: false, error: 'Employee not found' };
  }

  const entries = await prisma.payrollEntry.findMany({ where: { tenantId, runId, employeeId } });
  if (entries.length === 0) {
    return { success: false, error: 'No entries found for this person in this run' };
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const totalCents = entries.reduce((sum, e) => sum + e.amountCents, 0);

  const pdfBytes = await renderPayslipPdf({
    tenantName: tenant.name,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    periodLabel: run.periodLabel,
    currency: entries[0].currency,
    lines: entries.map((e) => ({
      label: ENTRY_TYPE_LABELS[e.type] || e.type,
      amountCents: e.amountCents,
    })),
    totalCents,
  });

  return { success: true, pdfBytes };
}

export async function buildPayslipForEntry(tenantId: string, entryId: string): Promise<PayslipResult> {
  const entry = await prisma.payrollEntry.findUnique({ where: { id: entryId }, include: { employee: true } });
  if (!entry || entry.tenantId !== tenantId) {
    return { success: false, error: 'Entry not found' };
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  const pdfBytes = await renderPayslipPdf({
    tenantName: tenant.name,
    employeeName: `${entry.employee.firstName} ${entry.employee.lastName}`,
    periodLabel: entry.paymentDate.toISOString().slice(0, 10),
    currency: entry.currency,
    lines: [{ label: ENTRY_TYPE_LABELS[entry.type] || entry.type, amountCents: entry.amountCents }],
    totalCents: entry.amountCents,
  });

  return { success: true, pdfBytes };
}
