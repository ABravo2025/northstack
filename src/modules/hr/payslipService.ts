import PDFDocument from 'pdfkit';
import prisma from '../../lib/prisma.js';

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

const ADJUSTMENT_TYPE_LABELS: Record<string, string> = {
  base: 'Base',
  bonus: 'Bonus',
  commission: 'Commission',
  reimbursement: 'Reimbursement',
  deduction: 'Deduction',
};

export interface GeneratePayslipResult {
  success: boolean;
  pdf?: Buffer;
  error?: string;
}

// Unidad 14 — a simple preview PDF built from a run's PayrollEntry rows for
// one employee (base + adjustments). Deliberately not a legal payslip: no
// document numbering, no signature, no country-specific compliance layout —
// marked as a preview both here and in the frontend modal, per spec.
export async function generatePayslipPdf(
  tenantId: string,
  runId: string,
  employeeId: string,
): Promise<GeneratePayslipResult> {
  const run = await prisma.payrollRun.findUnique({ where: { id: runId }, include: { payFrequency: true } });
  if (!run || run.tenantId !== tenantId) {
    return { success: false, error: 'Payroll run not found' };
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.tenantId !== tenantId) {
    return { success: false, error: 'Employee not found' };
  }

  const entries = await prisma.payrollEntry.findMany({
    where: { tenantId, runId, employeeId },
    orderBy: { createdAt: 'asc' },
  });
  if (entries.length === 0) {
    return { success: false, error: 'This person has no entries on this run' };
  }

  const total = entries.reduce((sum, e) => sum + e.amountCents, 0);
  const currency = entries[0].currency;

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  doc
    .fontSize(9)
    .fillColor('#b8502f')
    .text('PREVIEW ONLY — NOT SENT — NOT A LEGAL DOCUMENT', { align: 'right' })
    .fillColor('#0d2a48');

  doc.moveDown(1.5).fontSize(18).text('Payslip Preview', { align: 'left' });
  doc.moveDown(0.5).fontSize(11).fillColor('#333333');
  doc.text(`${employee.firstName} ${employee.lastName}`);
  doc.text(`Period: ${run.periodLabel}`);
  doc.text(`Pay frequency: ${run.payFrequency?.name ?? '—'}`);
  doc.text(`Generated: ${new Date().toISOString().slice(0, 10)}`);

  doc.moveDown(1.5).fontSize(12).fillColor('#0d2a48').text('Breakdown');
  doc.moveDown(0.5);

  const startX = doc.x;
  let y = doc.y;
  doc.fontSize(10).fillColor('#6f6a62');
  doc.text('Concept', startX, y);
  doc.text('Amount', startX + 350, y);
  doc.fillColor('#0d2a48');
  y += 16;
  doc
    .moveTo(startX, y)
    .lineTo(startX + 450, y)
    .strokeColor('#d8d1c5')
    .stroke();
  y += 8;

  for (const entry of entries) {
    doc.fontSize(10).fillColor('#0d2a48');
    const label = `${ADJUSTMENT_TYPE_LABELS[entry.type] || entry.type}${entry.label ? ` — ${entry.label}` : ''}${
      entry.hoursQty != null ? ` (${entry.hoursQty}h)` : ''
    }`;
    doc.text(label, startX, y, { width: 330 });
    doc.text(formatMoney(entry.amountCents, entry.currency), startX + 350, y);
    y += 20;
  }

  y += 4;
  doc
    .moveTo(startX, y)
    .lineTo(startX + 450, y)
    .strokeColor('#d8d1c5')
    .stroke();
  y += 10;
  doc.fontSize(11).fillColor('#0d2a48');
  doc.text('Total', startX, y);
  doc.text(formatMoney(total, currency), startX + 350, y);

  doc.end();
  const pdf = await done;
  return { success: true, pdf };
}
