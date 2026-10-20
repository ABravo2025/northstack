import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolContext } from './tools.js';
import type { PrivateApiResult } from './privateApiClient.js';
import { apiError, compact, confirmable, data, message, respond } from './toolHelpers.js';

// HR tools (2026-10-20): time-off policies and their assignment (the gap that started the
// Private API ↔ app parity review), balances, ledger, preview, cancelling, manual adjustments,
// holidays; inviting an employee to Northstack and re-sending their contract; read-only pay data.
// Who may do each is the app's own rule (HR = manage_custom_fields for policies and adjustments,
// invite_users for invitations, payroll access for pay data) — the Private API runs those routes as
// the connected person.

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;
const isoDate = z.string().describe('Calendar date, YYYY-MM-DD');
const confirmationArg = z.string().optional().describe('Only on the second call, after the user explicitly confirmed');

const policyRules = {
  accrualMethod: z.enum(['fixed_annual', 'monthly']).optional().describe('fixed_annual: all days on Jan 1; monthly: accrued month by month'),
  isPaid: z.boolean().optional(),
  requiresApproval: z.boolean().optional().describe("true: the person's manager approves each request"),
  color: z.string().optional().describe('Hex color for the calendar, e.g. #5b21e6'),
  dayCount: z.enum(['inherit', 'calendar', 'business']).optional().describe('How days are counted: calendar days, business days, or the company default (inherit)'),
  allowAdvance: z.boolean().optional().describe('Monthly accrual only: allow requesting days not accrued yet (never beyond the year total)'),
  unusedAction: z.enum(['carry', 'expire']).optional().describe('What happens to unused days on Dec 31'),
  carryOverMax: z.number().min(0).nullable().optional().describe('With carry: max days carried over (null = no limit)'),
};

function found(body: unknown): PrivateApiResult {
  return { ok: true, status: 200, body };
}

function notFound(error: string): PrivateApiResult {
  return { ok: false, status: 404, body: { error, code: 'not_found' } };
}

export function registerHrTools(server: McpServer, ctx: ToolContext): void {
  const { api } = ctx;

  // The connected person's own employee id, or an error result telling the model why not.
  async function ownEmployeeId(): Promise<string | CallToolResult> {
    const me = await api.get<{ user?: { employeeId?: string | null } }>('/me');
    if (!me.ok) return apiError(me);
    return me.body?.user?.employeeId ?? message('Your Northstack account is not linked to an employee record, so pass an employeeId.');
  }

  // ---------- Policies ----------

  server.registerTool('list_time_off_policies', {
    title: 'List time-off policies',
    description: "The workspace's time-off policies (vacation, sick days…) with their days per year and rules. Who has which: get_employee.",
    annotations: READ,
  }, async () => respond(api.get('/time-off-policies')));

  server.registerTool('create_time_off_policy', {
    title: 'Create time-off policy',
    description: 'Create a time-off policy (HR only). Then assign it to people with assign_time_off_policy. Rules that have no field (notice period, documentation needed) can go in the policy name or a note.',
    inputSchema: {
      name: z.string().min(1),
      daysPerYear: z.number().min(0),
      ...policyRules,
    },
    annotations: WRITE,
  }, async (input) => respond(api.post('/time-off-policies', compact(input)), 'Time-off policy created.'));

  server.registerTool('update_time_off_policy', {
    title: 'Update time-off policy',
    description: 'Change a time-off policy (HR only). isActive=false retires it (existing requests and balances are kept).',
    inputSchema: {
      id: z.string(),
      name: z.string().min(1).optional(),
      daysPerYear: z.number().min(0).optional(),
      isActive: z.boolean().optional(),
      ...policyRules,
    },
    annotations: WRITE,
  }, async ({ id, ...rest }) => respond(api.patch(`/time-off-policies/${id}`, compact(rest)), 'Time-off policy updated.'));

  server.registerTool('assign_time_off_policy', {
    title: 'Assign time-off policy',
    description: 'Give an employee a time-off policy so they can request it and accrue its days (HR only).',
    inputSchema: { employeeId: z.string(), timeOffPolicyId: z.string() },
    annotations: WRITE,
  }, async ({ employeeId, timeOffPolicyId }) =>
    respond(api.post(`/hr/employees/${employeeId}/time-off-policies`, { timeOffPolicyId }), 'Policy assigned.'));

  server.registerTool('unassign_time_off_policy', {
    title: 'Unassign time-off policy',
    description: "Remove a time-off policy from an employee (HR only). Two steps: first call returns a summary and confirmationToken; call again with it after the user confirms.",
    inputSchema: { employeeId: z.string(), timeOffPolicyId: z.string(), confirmationToken: confirmationArg },
    annotations: DESTRUCTIVE,
  }, async ({ employeeId, timeOffPolicyId, confirmationToken }) => confirmable(ctx, 'unassign_time_off_policy', `${employeeId}:${timeOffPolicyId}`, confirmationToken,
    async () => {
      const [employee, assigned] = await Promise.all([api.get<any>(`/hr/employees/${employeeId}`), api.get<any[]>(`/hr/employees/${employeeId}/time-off-policies`)]);
      if (!employee.ok) return employee;
      if (!assigned.ok) return assigned;
      const assignment = (assigned.body ?? []).find((a) => a.timeOffPolicyId === timeOffPolicyId);
      return assignment ? found({ employee: employee.body, policy: assignment.timeOffPolicy }) : notFound('That policy is not assigned to this employee');
    },
    ({ employee, policy }) => `You are about to remove the policy "${policy?.name}" from ${employee.firstName} ${employee.lastName}.`,
    () => api.delete(`/hr/employees/${employeeId}/time-off-policies/${timeOffPolicyId}`), 'Policy unassigned.'));

  // ---------- Balances, ledger, preview ----------

  server.registerTool('time_off_balance', {
    title: 'Time-off balance',
    description:
      'Days available per policy (accrued, used, pending, carried over). Default: your own. employeeId: one person (yourself, or anyone for HR). scope="team": your direct reports. scope="all": everyone (HR only).',
    inputSchema: { employeeId: z.string().optional(), scope: z.enum(['team', 'all']).optional() },
    annotations: READ,
  }, async ({ employeeId, scope }) => {
    if (scope) return respond(api.get('/hr/time-off-balances', scope === 'team' ? { scope: 'team' } : {}));
    const id = employeeId ?? (await ownEmployeeId());
    if (typeof id !== 'string') return id;
    return respond(api.get(`/hr/employees/${id}/time-off-balance`));
  });

  server.registerTool('time_off_ledger', {
    title: 'Time-off ledger',
    description: "Every movement on someone's time-off balances (accruals, requests, adjustments, carry-over), for the person, their manager or HR. Default: your own.",
    inputSchema: { employeeId: z.string().optional() },
    annotations: READ,
  }, async ({ employeeId }) => {
    const id = employeeId ?? (await ownEmployeeId());
    if (typeof id !== 'string') return id;
    return respond(api.get(`/hr/employees/${id}/time-off-ledger`));
  });

  server.registerTool('preview_time_off', {
    title: 'Preview time off',
    description: 'Before requesting time off for yourself: how many days a date range would use from a policy (weekends and holidays per its rules) and the balance left.',
    inputSchema: { timeOffPolicyId: z.string(), startDate: isoDate, endDate: isoDate },
    annotations: READ,
  }, async (input) => respond(api.post('/hr/time-off-requests/preview', input)));

  server.registerTool('cancel_time_off', {
    title: 'Cancel time off',
    description: 'Cancel one of your own time-off requests (pending, or approved and not started). Two steps: first call returns a summary and confirmationToken; call again with it after the user confirms.',
    inputSchema: { id: z.string(), confirmationToken: confirmationArg },
    annotations: DESTRUCTIVE,
  }, async ({ id, confirmationToken }) => confirmable(ctx, 'cancel_time_off', id, confirmationToken,
    async () => {
      const mine = await api.get<any[]>('/hr/time-off-requests');
      if (!mine.ok) return mine;
      const request = (mine.body ?? []).find((r) => r.id === id);
      return request ? found(request) : notFound('Not one of your time-off requests');
    },
    (r) => `You are about to cancel your ${r.timeOffPolicy?.name ?? 'time off'} from ${String(r.startDate).slice(0, 10)} to ${String(r.endDate).slice(0, 10)} (status: ${r.status}).`,
    () => api.delete(`/hr/time-off-requests/${id}`), 'Time off cancelled.'));

  server.registerTool('adjust_time_off_balance', {
    title: 'Adjust time-off balance',
    description:
      "Manually add (positive) or take away (negative) days on someone's policy balance, with a reason the person will see (HR only; half days allowed; can't go below zero). Two steps: first call returns a summary and confirmationToken; call again with it after the user confirms.",
    inputSchema: {
      employeeId: z.string(),
      timeOffPolicyId: z.string(),
      days: z.number().refine((d) => d !== 0 && Number.isInteger(d * 2), 'Non-zero whole or half number'),
      reason: z.string().min(1).max(300),
      confirmationToken: confirmationArg,
    },
    annotations: DESTRUCTIVE,
  }, async ({ employeeId, timeOffPolicyId, days, reason, confirmationToken }) =>
    confirmable(ctx, `adjust_time_off_balance:${timeOffPolicyId}:${days}`, employeeId, confirmationToken,
      async () => {
        const [employee, policies] = await Promise.all([api.get<any>(`/hr/employees/${employeeId}`), api.get<any[]>('/time-off-policies')]);
        if (!employee.ok) return employee;
        const policy = policies.ok ? (policies.body ?? []).find((p) => p.id === timeOffPolicyId) : undefined;
        return found({ ...employee.body, policyName: policy?.name ?? timeOffPolicyId });
      },
      (e) => `You are about to ${days > 0 ? 'ADD' : 'TAKE AWAY'} ${Math.abs(days)} day(s) on ${e.firstName} ${e.lastName}'s "${e.policyName}" balance. Reason shown to them: "${reason}".`,
      () => api.post(`/hr/employees/${employeeId}/time-off-adjustments`, { timeOffPolicyId, days, reason }), 'Balance adjusted.'));

  // ---------- Rules and holidays ----------

  server.registerTool('time_off_rules', {
    title: 'Time-off rules and holidays',
    description: "The company's time-off settings (default day counting, country, religions enabled) and its public holidays for a year (default: current year). Holidays are edited in Settings.",
    inputSchema: { year: z.number().int().min(2000).max(2100).optional() },
    annotations: READ,
  }, async ({ year }) => {
    const [settings, holidays] = await Promise.all([api.get('/time-off/settings'), api.get('/time-off/holidays', { year: year ?? new Date().getUTCFullYear() })]);
    if (!settings.ok) return apiError(settings);
    if (!holidays.ok) return apiError(holidays);
    return data({ settings: settings.body, holidays: holidays.body });
  });

  server.registerTool('religious_holidays', {
    title: 'Religious holidays',
    description:
      "Which religions' holidays apply to a person (when the company enabled them). Without religions: read. With religions: set them. Default: yourself; employeeId for someone else (HR).",
    inputSchema: {
      employeeId: z.string().optional(),
      religions: z.array(z.string()).optional().describe('Religion keys from the read result (enabledReligions); [] clears'),
    },
    annotations: WRITE,
  }, async ({ employeeId, religions }) => {
    const path = employeeId ? `/hr/employees/${employeeId}/religious-holidays` : '/time-off/my-religious-holidays';
    if (religions === undefined) return respond(api.get(path));
    return respond(api.put(path, { religions }), 'Religious holidays updated.');
  });

  // ---------- Invitation and contract (they e-mail the person — approved 2026-10-20) ----------

  server.registerTool('invite_employee', {
    title: 'Invite employee to Northstack',
    description:
      "Send an employee an e-mail invitation to create their Northstack login, with a role (list_catalogs kind=assignable_roles; default Member). Goes to the employee's work e-mail on file. Two steps: first call returns a summary and confirmationToken; call again with it after the user confirms.",
    inputSchema: { employeeId: z.string(), roleId: z.string().optional(), confirmationToken: confirmationArg },
    annotations: DESTRUCTIVE,
  }, async ({ employeeId, roleId, confirmationToken }) => confirmable(ctx, `invite_employee:${roleId ?? 'default'}`, employeeId, confirmationToken,
    async () => {
      const employee = await api.get<any>(`/hr/employees/${employeeId}`);
      if (!employee.ok || !roleId) return employee;
      const roles = await api.get<any[]>('/roles/assignable');
      if (!roles.ok) return roles;
      const role = (roles.body ?? []).find((r) => r.id === roleId);
      return role ? found({ ...employee.body, roleName: role.name }) : notFound('That role cannot be assigned');
    },
    (e) => `You are about to e-mail an invitation to ${e.email} (${e.firstName} ${e.lastName}) to join this Northstack workspace with the role "${e.roleName ?? 'Member'}". Check the e-mail address is right: whoever owns it gets that access.`,
    () => api.post(`/hr/employees/${employeeId}/invite`, compact({ roleId })), 'Invitation sent.'));

  server.registerTool('resend_contract', {
    title: 'Re-send contract',
    description: 'Re-send an employee the e-mail to review and confirm their pay contract (from Payroll). Two steps: first call returns a summary and confirmationToken; call again with it after the user confirms.',
    inputSchema: { employeeId: z.string(), confirmationToken: confirmationArg },
    annotations: DESTRUCTIVE,
  }, async ({ employeeId, confirmationToken }) => confirmable(ctx, 'resend_contract', employeeId, confirmationToken,
    () => api.get(`/hr/employees/${employeeId}`),
    (e) => `You are about to re-send the contract e-mail to ${e.firstName} ${e.lastName} (${e.email}).`,
    () => api.post(`/hr/employees/${employeeId}/resend-contract`, {}), 'Contract e-mail sent.'));

  // ---------- Pay data (read-only; spec decision #5) ----------

  server.registerTool('employee_pay', {
    title: 'Employee pay',
    description: "An employee's current compensation (rate, currency, frequency, contract confirmation) and payment history. Read-only; needs payroll access. Bank/payment account details are never returned.",
    inputSchema: { employeeId: z.string() },
    annotations: READ,
  }, async ({ employeeId }) => {
    const [compensation, history] = await Promise.all([
      api.get(`/hr/employees/${employeeId}/compensation`),
      api.get(`/hr/employees/${employeeId}/payment-history`),
    ]);
    if (!history.ok) return apiError(history);
    return data({ compensation: compensation.ok ? compensation.body : null, paymentHistory: history.body });
  });

  server.registerTool('payroll_reference', {
    title: 'Payroll reference',
    description:
      'Payroll lists (read-only): pay_frequencies, payment_methods, compensation_status (who has a confirmed contract, pending or none), off_payments (bonuses and one-off payments).',
    inputSchema: { view: z.enum(['pay_frequencies', 'payment_methods', 'compensation_status', 'off_payments']) },
    annotations: READ,
  }, async ({ view }) => {
    const path = { pay_frequencies: '/hr/pay-frequencies', payment_methods: '/hr/payment-methods', compensation_status: '/hr/payroll/compensation/status', off_payments: '/hr/payroll/off-payments' }[view];
    return respond(api.get(path));
  });
}
