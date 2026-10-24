import { randomBytes } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import type { PayrollEntry, Prisma } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { decryptPaymentAccountData } from '../../lib/encryption.js';
import { amountInWords } from './amountInWords.js';
import { localeForCountry } from '../../lib/numberLocale.js';

// Payroll v2 (spec-payroll-v2.md, unit 5): the payslip. Issued and numbered per company when a pay
// run is confirmed or a one-off payment is made, with a snapshot of everything it shows. Two
// layouts by the company's country: Argentina (recibo de pago: signatures, net in words) and the
// United States (pay stub). In the person's language. A tracking document: it says so, and it never
// replaces the legal payslip.

export type PayslipLayout = 'ar' | 'us';
export type LineKind = 'base_fixed' | 'base_hours' | 'overtime' | 'night' | 'bonus' | 'commission' | 'reimbursement' | 'deduction';

export interface PayslipLine {
  kind: LineKind;
  note: string | null;
  qty: number | null; // hours
  rateCents: number | null;
  pct: number | null; // overtime / night surcharge %
  amountCents: number;
}

export interface PayslipSnapshot {
  company: { name: string; legalName: string | null; address: string | null; phone: string | null; website: string | null };
  employee: { name: string; fileNumber: string | null; jobTitle: string | null; department: string | null; startDate: string | null };
  pay: { type: 'hourly' | 'fixed'; frequency: string | null; rateCents: number | null; method: string | null; account: string | null };
  signerName: string | null;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
}

// ---- pure (tested) -----------------------------------------------------------------------------

export function layoutFor(country: string | null): PayslipLayout {
  return (country ?? '').toUpperCase() === 'AR' ? 'ar' : 'us';
}

export function maskAccount(raw: string | null): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (text.includes('@')) {
    const [user, domain] = text.split('@');
    return `${user.slice(0, 1)}***@${domain}`;
  }
  const chars = text.replace(/[^0-9a-z]/gi, '');
  return chars.length > 4 ? `···· ${chars.slice(-4)}` : '····';
}

const pctFrom = (amount: number, qty: number | null, rate: number | null, surchargeOnly: boolean) =>
  qty && rate ? Math.round((amount / (qty * rate) - (surchargeOnly ? 0 : 1)) * 100) : null;

// The entries of one person (one currency) → earnings and deductions lines.
export function buildLines(entries: Pick<PayrollEntry, 'type' | 'amountCents' | 'hoursQty' | 'label' | 'overtimeKind'>[], pay: { type: 'hourly' | 'fixed'; rateCents: number | null }) {
  const earnings: PayslipLine[] = [];
  const deductions: PayslipLine[] = [];
  const order: Record<string, number> = { base: 0, overtime: 1, bonus: 2, commission: 3, reimbursement: 4, deduction: 5 };
  for (const e of [...entries].sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9))) {
    if (e.type === 'base') {
      earnings.push(
        pay.type === 'hourly'
          ? { kind: 'base_hours', note: null, qty: e.hoursQty ?? 0, rateCents: pay.rateCents, pct: null, amountCents: e.amountCents }
          : { kind: 'base_fixed', note: null, qty: null, rateCents: null, pct: null, amountCents: e.amountCents },
      );
    } else if (e.type === 'overtime') {
      const night = e.overtimeKind === 'night';
      earnings.push({ kind: night ? 'night' : 'overtime', note: e.overtimeKind === 'rest' ? 'rest' : null, qty: e.hoursQty, rateCents: pay.rateCents, pct: pctFrom(e.amountCents, e.hoursQty, pay.rateCents, night), amountCents: e.amountCents });
    } else if (e.type === 'deduction' || e.amountCents < 0) {
      deductions.push({ kind: 'deduction', note: e.label, qty: null, rateCents: null, pct: null, amountCents: -Math.abs(e.amountCents) });
    } else {
      earnings.push({ kind: e.type as LineKind, note: e.label, qty: null, rateCents: null, pct: null, amountCents: e.amountCents });
    }
  }
  const grossCents = earnings.reduce((n, l) => n + l.amountCents, 0);
  const deductionsCents = deductions.reduce((n, l) => n + l.amountCents, 0);
  return { earnings, deductions, grossCents, deductionsCents, netCents: grossCents + deductionsCents };
}

export function numberLabel(prefix: number, number: number): string {
  return `${String(prefix).padStart(4, '0')}-${String(number).padStart(6, '0')}`;
}

export function newVerifyCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const chars = [...randomBytes(8)].map((b) => alphabet[b % alphabet.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

// ---- labels ------------------------------------------------------------------------------------

const L = {
  es: {
    title: 'Recibo de pago', stub: 'Recibo de pago', person: 'Persona', file: 'Legajo', job: 'Puesto', dept: 'Área', start: 'Fecha de ingreso', period: 'Período', payDate: 'Fecha de pago', mode: 'Modalidad', method: 'Cobro',
    hourly: 'Por hora', fixed: 'Sueldo fijo', earnings: 'Haberes', deductions: 'Deducciones', concept: 'Concepto', qty: 'Cantidad', rate: 'Tarifa', amount: 'Importe', totalEarnings: 'Total haberes', totalDeductions: 'Total deducciones',
    net: 'Neto a cobrar', companySign: 'Firma de la empresa', received: 'Recibí conforme', verify: 'Verificar', preview: 'VISTA PREVIA - SIN EMITIR', number: 'N.º',
    legal: 'Documento de seguimiento emitido con Northstack. No reemplaza al recibo de sueldo que exige la ley laboral de cada país.',
    lines: { base_fixed: 'Sueldo básico', base_hours: 'Horas normales', overtime: 'Horas extra', rest: 'Horas extra en descanso / feriado', night: 'Recargo nocturno', bonus: 'Bono', commission: 'Comisión', reimbursement: 'Reintegro', deduction: 'Deducción' },
    hoursUnit: 'h',
    methods: { bank_ar: 'Transferencia bancaria', mercadopago: 'Mercado Pago', bank_intl: 'Transferencia internacional', wise: 'Wise', payoneer: 'Payoneer', paypal: 'PayPal', cash: 'Efectivo' } as Record<string, string>,
  },
  en: {
    title: 'Payslip', stub: 'Pay stub', person: 'Employee', file: 'Employee ID', job: 'Job title', dept: 'Department', start: 'Start date', period: 'Pay period', payDate: 'Pay date', mode: 'Pay type', method: 'Paid by',
    hourly: 'Hourly', fixed: 'Salary', earnings: 'Earnings', deductions: 'Deductions', concept: 'Description', qty: 'Hours', rate: 'Rate', amount: 'Current', totalEarnings: 'Gross pay', totalDeductions: 'Total deductions',
    net: 'Net pay', companySign: 'Company signature', received: 'Received by', verify: 'Verify', preview: 'PREVIEW - NOT ISSUED', number: 'No.',
    legal: 'Tracking document issued with Northstack. It does not replace any payslip required by employment law.',
    lines: { base_fixed: 'Regular salary', base_hours: 'Regular hours', overtime: 'Overtime', rest: 'Overtime, rest day / holiday', night: 'Night differential', bonus: 'Bonus', commission: 'Commission', reimbursement: 'Reimbursement', deduction: 'Deduction' },
    hoursUnit: 'h',
    methods: { bank_ar: 'Bank transfer', mercadopago: 'Mercado Pago', bank_intl: 'Wire transfer', wise: 'Wise', payoneer: 'Payoneer', paypal: 'PayPal', cash: 'Cash' } as Record<string, string>,
  },
};

const safe = (text: string) => text.replace(/[−]/g, '-').replace(/[^\x20-\x7e\xa0-\xff·–—•]/g, '?');

function money(cents: number, currency: string, locale: string, withCode = false) {
  const n = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
  return withCode ? `${currency} ${n}` : n;
}
const hoursText = (h: number, locale: string) => `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(h)} h`;
const dateText = (iso: string | null, lang: 'es' | 'en') => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(lang === 'es' ? 'es-AR' : 'en-US', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');

export interface RenderInput {
  layout: PayslipLayout;
  lang: 'es' | 'en';
  numberText: string | null; // null = preview
  verifyCode: string | null;
  verifyUrl: string | null;
  periodText: string;
  paymentDate: string;
  currency: string;
  snapshot: PayslipSnapshot;
  logo: { bytes: Uint8Array; mimeType: string } | null;
  signature: { bytes: Uint8Array; mimeType: string } | null;
  // Number format from the company's country (lib/numberLocale.ts); defaults by layout.
  numberLocale?: string;
}

// ---- PDF ---------------------------------------------------------------------------------------

export async function renderPayslipV2(input: RenderInput): Promise<Uint8Array> {
  const t = L[input.lang];
  const { snapshot: s, currency, lang } = input;
  const loc = input.numberLocale ?? (input.layout === 'ar' ? 'es-AR' : 'en-US');
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const ink = rgb(0.106, 0.09, 0.2);
  const muted = rgb(0.37, 0.35, 0.47);
  const faint = rgb(0.55, 0.53, 0.65);
  const violet = rgb(0.357, 0.129, 0.902);
  const line = rgb(0.89, 0.88, 0.93);
  const X0 = 48;
  const X1 = 564;
  const W = X1 - X0;
  const text = (p: PDFPage, str: string, x: number, y: number, size: number, f: PDFFont = font, color = ink) => p.drawText(safe(str), { x, y, size, font: f, color });
  const right = (p: PDFPage, str: string, xr: number, y: number, size: number, f: PDFFont = font, color = ink) => {
    const v = safe(str);
    p.drawText(v, { x: xr - f.widthOfTextAtSize(v, size), y, size, font: f, color });
  };
  const fit = (str: string, max: number, size: number, f: PDFFont = font) => {
    let v = safe(str);
    while (v.length > 1 && f.widthOfTextAtSize(v, size) > max) v = v.slice(0, -2) + '.';
    return v;
  };
  // Up to two lines; the second one is shortened if it still doesn't fit.
  const wrap2 = (str: string, max: number, size: number, f: PDFFont = font): string[] => {
    const words = safe(str).split(' ');
    let first = '';
    while (words.length && f.widthOfTextAtSize(first ? `${first} ${words[0]}` : words[0], size) <= max) first = first ? `${first} ${words.shift()}` : words.shift()!;
    if (!first) return [fit(str, max, size, f)];
    return words.length ? [first, fit(words.join(' '), max, size, f)] : [first];
  };

  let y = 744;
  if (!input.numberText) {
    text(page, t.preview, X0, y + 22, 9, bold, rgb(0.7, 0.15, 0.15));
  }
  // Header: logo + company, title + number.
  let cx = X0;
  if (input.logo) {
    try {
      const img = input.logo.mimeType === 'image/png' ? await doc.embedPng(input.logo.bytes) : await doc.embedJpg(input.logo.bytes);
      const scale = Math.min(42 / img.height, 90 / img.width);
      page.drawImage(img, { x: X0, y: y - 34, width: img.width * scale, height: img.height * scale });
      cx = X0 + img.width * scale + 12;
    } catch {
      // a bad image never blocks a payslip
    }
  }
  text(page, fit(s.company.legalName || s.company.name, 300, 15, serif), cx, y - 12, 15, serif);
  const coMeta = [s.company.address, s.company.phone, s.company.website].filter(Boolean).join(' · ');
  if (coMeta) text(page, fit(coMeta, 300, 8.5), cx, y - 26, 8.5, font, muted);
  right(page, input.layout === 'us' ? t.stub : t.title, X1, y - 12, 13, serif);
  right(page, input.numberText ? `${t.number} ${input.numberText}` : '—', X1, y - 26, 9, bold, violet);
  y -= 44;
  page.drawLine({ start: { x: X0, y }, end: { x: X1, y }, thickness: 1.6, color: ink });

  // Meta grid: 4 columns × 2 rows.
  const meta: [string, string][] = [
    [t.person, s.employee.name],
    [t.file, s.employee.fileNumber || '—'],
    [t.job, s.employee.jobTitle || '—'],
    [input.layout === 'ar' ? t.start : t.dept, input.layout === 'ar' ? dateText(s.employee.startDate, lang) : s.employee.department || '—'],
    [t.period, input.periodText],
    [t.payDate, dateText(input.paymentDate, lang)],
    [t.mode, [s.pay.type === 'hourly' ? t.hourly : t.fixed, s.pay.frequency].filter(Boolean).join(' · ')],
    [t.method, [s.pay.method, s.pay.account].filter(Boolean).join(' ') || '—'],
  ];
  const colW = W / 4;
  meta.forEach(([k, v], i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const mx = X0 + col * colW;
    const my = y - 16 - row * 38;
    text(page, k.toUpperCase(), mx, my, 6.8, bold, faint);
    wrap2(v, colW - 10, 9, bold).forEach((ln, j) => text(page, ln, mx, my - 11 - j * 10.5, 9, bold));
  });
  y -= 92;
  page.drawLine({ start: { x: X0, y }, end: { x: X1, y }, thickness: 0.6, color: line });

  // Tables.
  // Right edges of the hours and rate columns; the amount column ends at X1.
  const cQty = X0 + 250;
  const cRate = X0 + 360;
  const lineLabel = (l: PayslipLine) => {
    const base = l.kind === 'overtime' && l.note === 'rest' ? t.lines.rest : t.lines[l.kind];
    const withPct = l.pct !== null && (l.kind === 'overtime' || l.kind === 'night') ? `${base} +${l.pct} %` : base;
    return l.note && l.kind !== 'overtime' ? `${withPct} · ${l.note}` : withPct;
  };
  const table = (title: string, rows: PayslipLine[], totalLabel: string, showQty: boolean) => {
    y -= 20;
    text(page, title.toUpperCase(), X0, y, 7.5, bold, violet);
    y -= 14;
    text(page, t.concept.toUpperCase(), X0, y, 6.8, bold, faint);
    if (showQty) {
      right(page, t.qty.toUpperCase(), cQty + 40, y, 6.8, bold, faint);
      right(page, t.rate.toUpperCase(), cRate + 40, y, 6.8, bold, faint);
    }
    right(page, t.amount.toUpperCase(), X1, y, 6.8, bold, faint);
    y -= 5;
    page.drawLine({ start: { x: X0, y }, end: { x: X1, y }, thickness: 0.6, color: line });
    for (const r of rows) {
      y -= 15;
      text(page, fit(lineLabel(r), showQty ? cQty - X0 - 20 : X1 - X0 - 120, 9), X0, y, 9);
      if (showQty && r.qty !== null) right(page, hoursText(r.qty, loc), cQty + 40, y, 9);
      if (showQty && r.rateCents !== null && r.qty !== null) right(page, money(r.kind === 'night' ? Math.round((r.rateCents * (r.pct ?? 0)) / 100) : Math.round(r.rateCents * (1 + (r.kind === 'overtime' ? (r.pct ?? 0) / 100 : 0))), currency, loc), cRate + 40, y, 9);
      right(page, money(r.amountCents, currency, loc), X1, y, 9);
      page.drawLine({ start: { x: X0, y: y - 5 }, end: { x: X1, y: y - 5 }, thickness: 0.4, color: line, dashArray: [1, 2] });
    }
    y -= 17;
    text(page, totalLabel, X0, y, 9, bold);
    right(page, money(rows.reduce((n, r) => n + r.amountCents, 0), currency, loc), X1, y, 9, bold);
  };
  table(t.earnings, s.earnings, t.totalEarnings, true);
  if (s.deductions.length) table(t.deductions, s.deductions, t.totalDeductions, false);

  // Net box.
  const net = s.earnings.reduce((n, r) => n + r.amountCents, 0) + s.deductions.reduce((n, r) => n + r.amountCents, 0);
  y -= 22;
  const boxH = input.layout === 'ar' ? 46 : 36;
  page.drawRectangle({ x: X0, y: y - boxH + 12, width: W, height: boxH, color: rgb(0.953, 0.941, 0.996) });
  text(page, t.net, X0 + 12, y - 6, 11, bold);
  if (input.layout === 'ar') text(page, fit(amountInWords(net, currency, lang), 330, 8.5), X0 + 12, y - 20, 8.5, font, muted);
  right(page, money(net, currency, loc, true), X1 - 12, y - 10, 17, bold);
  y -= boxH + 18;

  // Signatures (Argentina) + verification.
  const qrSize = 64;
  const bottomY = Math.min(y - 46, 170);
  if (input.layout === 'ar') {
    const sw = 170;
    if (input.signature) {
      try {
        const img = input.signature.mimeType === 'image/png' ? await doc.embedPng(input.signature.bytes) : await doc.embedJpg(input.signature.bytes);
        const scale = Math.min(36 / img.height, (sw - 20) / img.width);
        page.drawImage(img, { x: X0 + (sw - img.width * scale) / 2, y: bottomY + 4, width: img.width * scale, height: img.height * scale });
      } catch {
        // ignore a bad signature image
      }
    }
    page.drawLine({ start: { x: X0, y: bottomY }, end: { x: X0 + sw, y: bottomY }, thickness: 0.6, color: faint });
    text(page, fit([t.companySign, s.signerName].filter(Boolean).join(' · '), sw, 8), X0, bottomY - 11, 8, font, muted);
    const x2 = X0 + sw + 30;
    page.drawLine({ start: { x: x2, y: bottomY }, end: { x: x2 + sw, y: bottomY }, thickness: 0.6, color: faint });
    text(page, fit(`${t.received} · ${s.employee.name}`, sw, 8), x2, bottomY - 11, 8, font, muted);
  }
  if (input.verifyCode && input.verifyUrl) {
    const png = await QRCode.toBuffer(input.verifyUrl, { margin: 0, width: 192, color: { dark: '#1b1733', light: '#ffffff' } });
    const img = await doc.embedPng(png);
    page.drawImage(img, { x: X1 - qrSize, y: bottomY - 12, width: qrSize, height: qrSize });
    right(page, `${t.verify} · ${input.verifyCode}`, X1, bottomY - 24, 7.5, bold, muted);
  }

  page.drawLine({ start: { x: X0, y: 64 }, end: { x: X1, y: 64 }, thickness: 0.6, color: line });
  text(page, t.legal, X0, 52, 7.5, font, faint);
  return doc.save();
}

// ---- issuing -----------------------------------------------------------------------------------

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function nextNumber(tx: PrismaTx, tenantId: string): Promise<{ number: number; prefix: number }> {
  const row = await tx.payslipSettings.upsert({ where: { tenantId }, create: { tenantId, nextNumber: 2 }, update: { nextNumber: { increment: 1 } } });
  return { number: row.nextNumber - 1, prefix: row.prefix };
}

async function snapshotFor(tenantId: string, employeeId: string, entries: PayrollEntry[]) {
  const [tenant, employee, comp, settings] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      include: { jobTitleDefn: { select: { name: true } }, departmentDefn: { select: { name: true } }, user: { select: { locale: true } } },
    }),
    prisma.employeeCompensation.findFirst({ where: { tenantId, employeeId, effectiveTo: null }, include: { payFrequency: { select: { name: true } }, paymentMethod: { select: { name: true, kind: true } } } }),
    prisma.payslipSettings.findUnique({ where: { tenantId } }),
  ]);
  let account: string | null = null;
  if (comp?.paymentAccountDataEncrypted) {
    try {
      account = maskAccount(decryptPaymentAccountData(comp.paymentAccountDataEncrypted));
    } catch {
      account = null;
    }
  }
  const layout = layoutFor(tenant.country);
  const lang: 'es' | 'en' = (employee.user?.locale ?? (layout === 'ar' ? 'es' : 'en')).startsWith('es') ? 'es' : 'en';
  const pay = { type: (comp?.compensationType ?? 'fixed') as 'hourly' | 'fixed', frequency: comp?.payFrequency?.name ?? null, rateCents: comp?.compensationType === 'hourly' ? comp.rateCents : null, method: comp?.paymentMethod ? (L[lang].methods[comp.paymentMethod.kind] ?? comp.paymentMethod.name) : null, account };
  const lines = buildLines(entries, pay);
  const snapshot: PayslipSnapshot = {
    company: { name: tenant.name, legalName: tenant.legalName, address: tenant.address, phone: tenant.phone, website: tenant.website },
    employee: {
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      fileNumber: employee.fileNumber,
      jobTitle: employee.jobTitleDefn?.name ?? comp?.jobTitle ?? null,
      department: employee.departmentDefn?.name ?? null,
      startDate: employee.startDate ? employee.startDate.toISOString().slice(0, 10) : null,
    },
    pay,
    signerName: settings?.signerName ?? null,
    earnings: lines.earnings,
    deductions: lines.deductions,
  };
  return { snapshot, layout, lang, totals: lines };
}

const byEmployeeCurrency = (entries: PayrollEntry[]) => {
  const groups = new Map<string, PayrollEntry[]>();
  for (const e of entries) groups.set(`${e.employeeId}|${e.currency}`, [...(groups.get(`${e.employeeId}|${e.currency}`) ?? []), e]);
  return groups;
};

// When a pay run is confirmed: one payslip per person (and per currency, if they were paid in two).
export async function issuePayslipsForRun(tenantId: string, runId: string): Promise<string[]> {
  const run = await prisma.payrollRun.findFirstOrThrow({ where: { id: runId, tenantId } });
  if (run.status !== 'confirmed') return [];
  const already = new Set((await prisma.payslip.findMany({ where: { tenantId, runId }, select: { employeeId: true, currency: true } })).map((p) => `${p.employeeId}|${p.currency}`));
  const entries = await prisma.payrollEntry.findMany({ where: { tenantId, runId }, orderBy: { createdAt: 'asc' } });
  const ids: string[] = [];
  for (const [key, group] of byEmployeeCurrency(entries)) {
    if (already.has(key)) continue;
    const { snapshot, layout, lang, totals } = await snapshotFor(tenantId, group[0].employeeId, group);
    const base = group.find((e) => e.type === 'base');
    const created = await prisma.$transaction(async (tx) => {
      const { number } = await nextNumber(tx, tenantId);
      return tx.payslip.create({
        data: {
          tenantId, employeeId: group[0].employeeId, runId, number, verifyCode: newVerifyCode(), layout, locale: lang,
          periodLabel: run.periodLabel, periodFrom: base?.hoursFrom ?? null, periodTo: base?.hoursTo ?? null,
          paymentDate: group[0].paymentDate, currency: group[0].currency,
          grossCents: totals.grossCents, deductionsCents: totals.deductionsCents, netCents: totals.netCents,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
    });
    ids.push(created.id);
  }
  return ids;
}

// A one-off payment: one payslip per person for the entries just created.
export async function issuePayslipsForEntries(tenantId: string, entryIds: string[], periodLabel: string): Promise<string[]> {
  const entries = await prisma.payrollEntry.findMany({ where: { tenantId, id: { in: entryIds }, runId: null } });
  const ids: string[] = [];
  for (const group of byEmployeeCurrency(entries).values()) {
    const { snapshot, layout, lang, totals } = await snapshotFor(tenantId, group[0].employeeId, group);
    const created = await prisma.$transaction(async (tx) => {
      const { number } = await nextNumber(tx, tenantId);
      return tx.payslip.create({
        data: {
          tenantId, employeeId: group[0].employeeId, entryIds: group.map((e) => e.id), number, verifyCode: newVerifyCode(), layout, locale: lang,
          periodLabel, paymentDate: group[0].paymentDate, currency: group[0].currency,
          grossCents: totals.grossCents, deductionsCents: totals.deductionsCents, netCents: totals.netCents,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
    });
    ids.push(created.id);
  }
  return ids;
}

const appBaseUrl = () => process.env.APP_BASE_URL ?? 'http://localhost:5173';
export const verifyUrl = (code: string) => `${appBaseUrl()}/verify/${code}`;

function periodText(p: { periodLabel: string; periodFrom: Date | null; periodTo: Date | null }, lang: 'es' | 'en') {
  if (!p.periodFrom || !p.periodTo) return p.periodLabel;
  return `${dateText(p.periodFrom.toISOString(), lang)} – ${dateText(p.periodTo.toISOString(), lang)}`;
}

async function brandingImages(tenantId: string) {
  const [tenant, settings] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { logoData: true, logoMimeType: true, country: true } }),
    prisma.payslipSettings.findUnique({ where: { tenantId }, select: { signatureData: true, signatureMime: true } }),
  ]);
  return {
    logo: tenant.logoData && tenant.logoMimeType ? { bytes: tenant.logoData, mimeType: tenant.logoMimeType } : null,
    signature: settings?.signatureData && settings.signatureMime ? { bytes: settings.signatureData, mimeType: settings.signatureMime } : null,
    numberLocale: localeForCountry(tenant.country),
  };
}

export async function renderIssuedPayslip(payslipId: string, tenantId: string, langOverride?: 'es' | 'en'): Promise<Uint8Array | null> {
  const p = await prisma.payslip.findFirst({ where: { id: payslipId, tenantId } });
  if (!p) return null;
  const settings = await prisma.payslipSettings.findUnique({ where: { tenantId } });
  const lang = langOverride ?? (p.locale.startsWith('es') ? 'es' : 'en');
  return renderPayslipV2({
    layout: p.layout === 'ar' ? 'ar' : 'us',
    lang,
    numberText: numberLabel(settings?.prefix ?? 1, p.number),
    verifyCode: p.verifyCode,
    verifyUrl: verifyUrl(p.verifyCode),
    periodText: periodText(p, lang),
    paymentDate: p.paymentDate.toISOString(),
    currency: p.currency,
    snapshot: p.snapshot as unknown as PayslipSnapshot,
    ...(await brandingImages(tenantId)),
  });
}

// A draft pay run's preview (nothing issued, no number).
export async function renderRunPreview(tenantId: string, runId: string, employeeId: string): Promise<Uint8Array | null> {
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, tenantId } });
  if (!run) return null;
  const entries = await prisma.payrollEntry.findMany({ where: { tenantId, runId, employeeId } });
  if (!entries.length) return null;
  const { snapshot, layout, lang } = await snapshotFor(tenantId, employeeId, entries);
  const base = entries.find((e) => e.type === 'base');
  return renderPayslipV2({
    layout, lang, numberText: null, verifyCode: null, verifyUrl: null,
    periodText: periodText({ periodLabel: run.periodLabel, periodFrom: base?.hoursFrom ?? null, periodTo: base?.hoursTo ?? null }, lang),
    paymentDate: entries[0].paymentDate.toISOString(), currency: entries[0].currency, snapshot,
    ...(await brandingImages(tenantId)),
  });
}

const serialize = (p: Awaited<ReturnType<typeof prisma.payslip.findFirstOrThrow>> & { employee?: { firstName: string; lastName: string } }, prefix: number) => ({
  id: p.id,
  number: numberLabel(prefix, p.number),
  employeeId: p.employeeId,
  employeeName: p.employee ? `${p.employee.firstName} ${p.employee.lastName}`.trim() : null,
  runId: p.runId,
  periodLabel: p.periodLabel,
  periodFrom: p.periodFrom ? p.periodFrom.toISOString().slice(0, 10) : null,
  periodTo: p.periodTo ? p.periodTo.toISOString().slice(0, 10) : null,
  paymentDate: p.paymentDate.toISOString().slice(0, 10),
  currency: p.currency,
  grossCents: p.grossCents,
  deductionsCents: p.deductionsCents,
  netCents: p.netCents,
  emailedAt: p.emailedAt,
  createdAt: p.createdAt,
});

export async function listPayslips(tenantId: string, filter: { employeeId?: string; runId?: string; q?: string }) {
  const settings = await prisma.payslipSettings.findUnique({ where: { tenantId } });
  const rows = await prisma.payslip.findMany({
    where: {
      tenantId,
      ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
      ...(filter.runId ? { runId: filter.runId } : {}),
      ...(filter.q ? { OR: [{ periodLabel: { contains: filter.q, mode: 'insensitive' } }, { employee: { OR: [{ firstName: { contains: filter.q, mode: 'insensitive' } }, { lastName: { contains: filter.q, mode: 'insensitive' } }] } }] } : {}),
    },
    include: { employee: { select: { firstName: true, lastName: true } } },
    orderBy: [{ paymentDate: 'desc' }, { number: 'desc' }],
    take: 500,
  });
  return rows.map((r) => serialize(r, settings?.prefix ?? 1));
}

// Public verification: only whether it exists, who issued it, the number and the period — no amounts.
export async function verifyPayslip(code: unknown) {
  if (typeof code !== 'string' || !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(code)) return null;
  const p = await prisma.payslip.findUnique({ where: { verifyCode: code.toUpperCase() }, include: { tenant: { select: { name: true, legalName: true } }, employee: { select: { firstName: true, lastName: true } } } });
  if (!p) return null;
  const settings = await prisma.payslipSettings.findUnique({ where: { tenantId: p.tenantId } });
  return {
    company: p.tenant.legalName || p.tenant.name,
    number: numberLabel(settings?.prefix ?? 1, p.number),
    employee: `${p.employee.firstName} ${p.employee.lastName.slice(0, 1)}.`,
    periodLabel: p.periodLabel,
    paymentDate: p.paymentDate.toISOString().slice(0, 10),
    issuedAt: p.createdAt,
  };
}
