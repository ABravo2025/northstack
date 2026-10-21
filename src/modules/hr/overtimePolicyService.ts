import prisma from '../../lib/prisma.js';
import { TEMPLATES, parseRules, type OvertimeRules, type OvertimeTemplate } from './overtimeRules.js';

// Overtime and surcharges (spec-overtime.md, Growth): the company's rules (Payroll → Payment policies
// → Overtime) and who doesn't get overtime. Off until the company turns it on.

export interface OvertimePolicyView extends OvertimeRules {
  enabled: boolean;
  template: OvertimeTemplate;
}

const isTemplate = (v: unknown): v is OvertimeTemplate => v === 'ar' || v === 'us' || v === 'custom';

export async function getOvertimePolicy(tenantId: string): Promise<OvertimePolicyView> {
  const row = await prisma.overtimePolicy.findUnique({ where: { tenantId } });
  if (!row) return { enabled: false, template: 'custom', ...TEMPLATES.custom };
  return {
    enabled: row.enabled,
    template: isTemplate(row.template) ? row.template : 'custom',
    dailyThresholdMinutes: row.dailyThresholdMinutes,
    weeklyThresholdMinutes: row.weeklyThresholdMinutes,
    weekdayPct: row.weekdayPct,
    restPct: row.restPct,
    restWeekdays: row.restWeekdays,
    saturdayFromMinute: row.saturdayFromMinute,
    holidaysAreRest: row.holidaysAreRest,
    nightPct: row.nightPct,
    nightStartMinute: row.nightStartMinute,
    nightEndMinute: row.nightEndMinute,
  };
}

// The rules to apply, or null when overtime is off for this company.
export async function activeOvertimeRules(tenantId: string): Promise<OvertimeRules | null> {
  const p = await getOvertimePolicy(tenantId);
  return p.enabled ? p : null;
}

export async function saveOvertimePolicy(tenantId: string, input: Record<string, unknown>) {
  const parsed = parseRules(input);
  if (!parsed.success) return parsed;
  const data = { ...parsed.value, enabled: input.enabled === true, template: isTemplate(input.template) ? input.template : 'custom' };
  await prisma.overtimePolicy.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
  return { success: true as const, value: await getOvertimePolicy(tenantId) };
}

// People paid by the hour (the only ones overtime applies to), with their exemption.
export async function listOvertimePeople(tenantId: string) {
  const comps = await prisma.employeeCompensation.findMany({
    where: { tenantId, effectiveTo: null, compensationType: 'hourly' },
    select: { employee: { select: { id: true, firstName: true, lastName: true, overtimeExempt: true } } },
  });
  return comps
    .map((c) => ({ id: c.employee.id, name: `${c.employee.firstName} ${c.employee.lastName}`.trim(), exempt: c.employee.overtimeExempt }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function setOvertimeExempt(tenantId: string, employeeId: unknown, exempt: unknown) {
  if (typeof employeeId !== 'string' || typeof exempt !== 'boolean') return { success: false as const, error: 'Pick a person' };
  const r = await prisma.employee.updateMany({ where: { id: employeeId, tenantId }, data: { overtimeExempt: exempt } });
  return r.count === 1 ? { success: true as const } : { success: false as const, error: 'Person not found' };
}
