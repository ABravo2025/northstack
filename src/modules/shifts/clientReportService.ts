import { createHash, randomBytes } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import prisma from '../../lib/prisma.js';
import { drawCompanyHeader } from '../../lib/pdfCompanyHeader.js';
import { toTenantBranding } from '../tenant/tenantProfileService.js';

// Shifts phase 2, block D (spec-shifts-fase2.md §D, Growth): the hours a client is being billed for,
// shared with the client. Only APPROVED timesheet weeks count. Delivered as a PDF (by email, with a
// download in the app) or as a private read-only link that expires after 30 days.

const LINK_DAYS = 30;
type Result<T> = { success: true; value: T } | { success: false; error: string; field?: string };

export const hashReportToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface ClientReportLine {
  date: string;
  person: string | null;
  description: string | null;
  project: string | null;
  minutes: number;
  billable: boolean;
}

export interface ClientReportData {
  tenantName: string;
  company: { id: string; name: string };
  project: { id: string; name: string } | null;
  from: string;
  to: string;
  showPeople: boolean;
  lines: ClientReportLine[];
  totalMinutes: number;
  billableMinutes: number;
}

// Pure (tested): totals and the per-line view, people hidden when asked.
export function summarize(lines: ClientReportLine[], showPeople: boolean) {
  return {
    lines: lines.map((l) => ({ ...l, person: showPeople ? l.person : null })),
    totalMinutes: lines.reduce((n, l) => n + l.minutes, 0),
    billableMinutes: lines.filter((l) => l.billable).reduce((n, l) => n + l.minutes, 0),
  };
}

export function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
}

export async function collectClientReport(
  tenantId: string,
  input: { companyId: string; projectId: string | null; from: string; to: string; showPeople: boolean },
): Promise<Result<ClientReportData>> {
  const [tenant, company, project] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.company.findFirst({ where: { id: input.companyId, tenantId }, select: { id: true, name: true } }),
    input.projectId ? prisma.project.findFirst({ where: { id: input.projectId, tenantId }, select: { id: true, name: true, companyId: true } }) : Promise.resolve(null),
  ]);
  if (!company) return { success: false, error: 'Company not found', field: 'companyId' };
  if (input.projectId && (!project || project.companyId !== company.id)) return { success: false, error: 'That project is not this company’s', field: 'projectId' };
  const entries = await prisma.timeEntry.findMany({
    where: {
      tenantId,
      companyId: company.id,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      date: { gte: new Date(`${input.from}T00:00:00Z`), lte: new Date(`${input.to}T00:00:00Z`) },
      timesheet: { status: 'approved' },
    },
    include: { employee: { select: { firstName: true, lastName: true } } },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });
  const projectIds = [...new Set(entries.map((e) => e.projectId).filter((x): x is string => !!x))];
  const names = new Map(
    (projectIds.length ? await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }) : []).map((p) => [p.id, p.name]),
  );
  const raw: ClientReportLine[] = entries.map((e) => ({
    date: e.date.toISOString().slice(0, 10),
    person: `${e.employee.firstName} ${e.employee.lastName}`,
    description: e.description,
    project: e.projectId ? (names.get(e.projectId) ?? null) : null,
    minutes: e.minutes,
    billable: e.billable,
  }));
  const s = summarize(raw, input.showPeople);
  return {
    success: true,
    value: {
      tenantName: tenant?.name ?? '',
      company,
      project: project ? { id: project.id, name: project.name } : null,
      from: input.from,
      to: input.to,
      showPeople: input.showPeople,
      ...s,
    },
  };
}

const safe = (text: string) => text.replace(/[^\x20-\x7e\xa0-\xff]/g, '?');

// The PDF: company header, title, period, then the lines (new pages as needed), then totals.
export async function renderClientReportPdf(tenantId: string, data: ClientReportData, lang: 'en' | 'es'): Promise<Uint8Array> {
  const L =
    lang === 'es'
      ? { title: 'Informe de horas', period: 'Periodo', project: 'Proyecto', date: 'Fecha', person: 'Persona', what: 'Detalle', hours: 'Horas', total: 'Total', billable: 'Facturable', none: 'No hay horas aprobadas en este periodo.' }
      : { title: 'Hours report', period: 'Period', project: 'Project', date: 'Date', person: 'Person', what: 'Details', hours: 'Hours', total: 'Total', billable: 'Billable', none: 'No approved hours in this period.' };
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  let page = doc.addPage([612, 792]);
  let y = 740;
  y = await drawCompanyHeader({ doc, page, font, boldFont: bold, branding: toTenantBranding(tenant), y });
  const text = (t: string, x: number, size = 10, isBold = false, color = rgb(0, 0, 0)) =>
    page.drawText(safe(t), { x, y, size, font: isBold ? bold : font, color });
  const fit = (t: string, width: number, size = 9) => {
    let s = safe(t);
    while (s.length > 1 && font.widthOfTextAtSize(s, size) > width) s = `${s.slice(0, -2)}…`.replace(/[^\x20-\x7e\xa0-\xff]/g, '.');
    return s;
  };

  y -= 6;
  text(`${L.title} · ${data.company.name}`.replace('·', '-'), 50, 15, true);
  y -= 20;
  text(`${L.period}: ${data.from} - ${data.to}`, 50, 10, false, rgb(0.3, 0.3, 0.3));
  y -= 14;
  if (data.project) {
    text(`${L.project}: ${data.project.name}`, 50, 10, false, rgb(0.3, 0.3, 0.3));
    y -= 14;
  }
  y -= 10;

  const cols = data.showPeople
    ? { date: 50, person: 120, what: 245, hours: 520 }
    : { date: 50, person: -1, what: 120, hours: 520 };
  const header = () => {
    text(L.date, cols.date, 9, true);
    if (cols.person > 0) text(L.person, cols.person, 9, true);
    text(L.what, cols.what, 9, true);
    text(L.hours, cols.hours, 9, true);
    y -= 6;
    page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    y -= 12;
  };
  header();
  if (data.lines.length === 0) {
    text(L.none, 50, 10, false, rgb(0.4, 0.4, 0.4));
    y -= 14;
  }
  for (const l of data.lines) {
    if (y < 80) {
      page = doc.addPage([612, 792]);
      y = 740;
      header();
    }
    text(l.date, cols.date, 9);
    if (cols.person > 0) text(fit(l.person ?? '', 115), cols.person, 9);
    text(fit([l.project, l.description].filter(Boolean).join(' - ') || '-', cols.hours - cols.what - 10), cols.what, 9);
    text(hoursLabel(l.minutes), cols.hours, 9);
    y -= 14;
  }
  y -= 6;
  page.drawLine({ start: { x: 50, y: y + 8 }, end: { x: 562, y: y + 8 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  text(L.total, cols.what, 10, true);
  text(hoursLabel(data.totalMinutes), cols.hours, 10, true);
  y -= 14;
  text(L.billable, cols.what, 10);
  text(hoursLabel(data.billableMinutes), cols.hours, 10);
  return doc.save();
}

export async function createClientReportLink(
  tenantId: string,
  input: { companyId: string; projectId: string | null; from: string; to: string; showPeople: boolean },
  actorUserId: string,
  emailedTo: string | null,
): Promise<{ id: string; token: string; expiresAt: Date }> {
  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + LINK_DAYS * 86_400_000);
  const row = await prisma.clientHoursReport.create({
    data: {
      tenantId,
      companyId: input.companyId,
      projectId: input.projectId,
      from: new Date(`${input.from}T00:00:00Z`),
      to: new Date(`${input.to}T00:00:00Z`),
      showPeople: input.showPeople,
      tokenHash: hashReportToken(token),
      expiresAt,
      emailedTo,
      createdById: actorUserId,
    },
  });
  return { id: row.id, token, expiresAt };
}

export async function findReportByToken(token: string) {
  if (!token || token.length > 100) return null;
  const row = await prisma.clientHoursReport.findUnique({ where: { tokenHash: hashReportToken(token) } });
  if (!row || row.expiresAt <= new Date()) return null;
  return row;
}
