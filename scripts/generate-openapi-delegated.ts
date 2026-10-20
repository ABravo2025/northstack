// Regenerates the delegated endpoints in frontend/public/openapi.json from the Private API's
// allowlist (src/routes/externalApiDelegation.ts) — run after changing that list:
//   npx tsx scripts/generate-openapi-delegated.ts
// Hand-written endpoints (tasks, notes, CRM, employees, time off, payroll) are left untouched;
// generated ones carry `x-delegated: true` so a re-run replaces exactly those.
import fs from 'node:fs';
import path from 'node:path';
import { DELEGATED_ROUTES } from '../src/routes/externalApiDelegation.js';

const OPENAPI_PATH = path.resolve('frontend/public/openapi.json');

const SUMMARIES: Record<string, string> = {
  'GET /api/tasks/mentionable-users': 'Active users (ids for assignees and @mentions)',
  'GET /api/hr/employees/directory': 'Company directory (name, job title, department)',
  'GET /api/hr/employees/birthdays': 'Upcoming birthdays',
  'GET /api/field-catalog': 'Pick-list catalog by kind (department, jobTitle, leadSource, winReason, lossReason, companySize)',
  'GET /api/status-definitions': 'Status definitions (entityType, default employee)',
  'GET /api/hr/custom-fields': 'Custom-field definitions (entityType, default employee)',
  'GET /api/tenants/current': 'Company profile',
  'GET /api/roles/assignable': 'Roles that can be given in an invitation',
  'GET /api/tags': 'Tags in use',
  'GET /api/activity': "One record's activity (entityType, entityId)",
  'GET /api/activity/feed': 'Workspace activity feed (userId, action, source, entityType, from, to, cursor)',
  'GET /api/notifications': "The acting user's notifications (AI assistants only)",
  'GET /api/notifications/unread-count': 'Unread notifications count (AI assistants only)',
  'PATCH /api/notifications/:id/read': 'Mark a notification read (AI assistants only)',
  'POST /api/notifications/mark-all-read': 'Mark all notifications read (AI assistants only)',
  'GET /api/tasks/:id/comments': "A task's comments",
  'POST /api/tasks/:id/comments': 'Comment on a task (body, mentionedUserIds)',
  'DELETE /api/tasks/:id/comments/:commentId': 'Delete a task comment',
  'POST /api/tasks/:id/timer': "Start or stop a task's timer (action: start|stop)",
  'GET /api/task-folders': 'Task folders',
  'POST /api/task-folders': 'Create a task folder (name)',
  'DELETE /api/task-folders/:id': 'Delete a task folder (tasks are kept)',
  'GET /api/tags/:entityType/:entityId': "A record's tags",
  'POST /api/tags/:entityType/:entityId': 'Tag a record (name)',
  'DELETE /api/tags/assignments/:id': 'Remove a tag from a record',
  'GET /api/hr/employees/:id/custom-fields': "An employee's custom-field values",
  'POST /api/hr/employees/:id/custom-fields': 'Set an employee custom field (customFieldDefinitionId, value)',
  'PATCH /api/hr/employees/:id/custom-fields/:valueId': 'Change an employee custom-field value (value)',
  'DELETE /api/hr/employees/:id/custom-fields/:valueId': 'Clear an employee custom-field value',
  'POST /api/hr/employees/:id/invite': 'E-mail an employee an invitation to Northstack (roleId optional)',
  'POST /api/hr/employees/:id/resend-contract': 'Re-send the pay-contract confirmation e-mail',
  'GET /api/time-off-policies': 'Time-off policies',
  'POST /api/time-off-policies': 'Create a time-off policy (name, daysPerYear, accrualMethod, isPaid, requiresApproval, dayCount, allowAdvance, unusedAction, carryOverMax)',
  'PATCH /api/time-off-policies/:id': 'Change or retire (isActive=false) a time-off policy',
  'GET /api/hr/time-off-requests': 'Time-off requests as in the app (scope: mine|team|calendar|pending-approval|all)',
  'DELETE /api/hr/time-off-requests/:id': "Cancel one of the acting user's own requests",
  'GET /api/hr/time-off-balances': 'Balances of everyone (HR) or of your direct reports (scope=team)',
  'GET /api/hr/employees/:id/time-off-policies': "An employee's assigned policies",
  'POST /api/hr/employees/:id/time-off-policies': 'Assign a policy to an employee (timeOffPolicyId)',
  'DELETE /api/hr/employees/:id/time-off-policies/:policyId': 'Unassign a policy from an employee',
  'GET /api/hr/employees/:id/time-off-balance': "An employee's balances per policy",
  'GET /api/hr/employees/:id/time-off-ledger': "An employee's balance movements",
  'POST /api/hr/employees/:id/time-off-adjustments': 'Manual balance adjustment (timeOffPolicyId, days, reason)',
  'GET /api/hr/employees/:id/religious-holidays': "An employee's religions for holidays",
  'PUT /api/hr/employees/:id/religious-holidays': "Set an employee's religions (religions[])",
  'POST /api/hr/time-off-requests/preview': 'Preview the days a request would use (timeOffPolicyId, startDate, endDate)',
  'GET /api/time-off/settings': 'Time-off settings',
  'GET /api/time-off/holidays': 'Public holidays (year)',
  'GET /api/time-off/religions': 'Religions available for holidays',
  'GET /api/time-off/my-religious-holidays': "The acting user's religions",
  'PUT /api/time-off/my-religious-holidays': "Set the acting user's religions (religions[])",
  'GET /api/hr/pay-frequencies': 'Pay frequencies',
  'GET /api/hr/payment-methods': 'Payment methods (names only)',
  'GET /api/hr/payroll/compensation/status': 'Contract/compensation status per employee',
  'GET /api/hr/payroll/off-payments': 'Off-cycle payments (bonuses, one-offs)',
  'GET /api/hr/employees/:id/compensation': "An employee's current compensation (no account data)",
  'GET /api/hr/employees/:id/payment-history': "An employee's payment history (no account data)",
  'GET /api/companies/:id/custom-fields': "A company's custom-field values",
  'POST /api/companies/:id/custom-fields': 'Set a company custom field (customFieldDefinitionId, value)',
  'PATCH /api/companies/:id/custom-fields/:valueId': 'Change a company custom-field value (value)',
  'DELETE /api/companies/:id/custom-fields/:valueId': 'Clear a company custom-field value',
  'GET /api/contacts/:id/custom-fields': "A contact's custom-field values",
  'POST /api/contacts/:id/custom-fields': 'Set a contact custom field (customFieldDefinitionId, value)',
  'PATCH /api/contacts/:id/custom-fields/:valueId': 'Change a contact custom-field value (value)',
  'DELETE /api/contacts/:id/custom-fields/:valueId': 'Clear a contact custom-field value',
  'POST /api/opportunities/:id/contacts': 'Link a contact to an opportunity (contactId, role)',
  'DELETE /api/opportunities/:id/contacts/:contactId': 'Unlink a contact from an opportunity',
  'GET /api/opportunities/:id/stage-history': "An opportunity's stage history",
  'GET /api/projects': 'Projects (status, companyId, employeeId, archived)',
  'GET /api/projects/options': 'People and companies for project pickers',
  'POST /api/projects': 'Create a project (name, ownerEmployeeId, companyId, status, dates, members, phases)',
  'POST /api/projects/from-template': 'Create a project from a template (templateId + project fields)',
  'GET /api/projects/:id': 'One project with phases and team',
  'PATCH /api/projects/:id': 'Change or archive a project (incl. budgetMinutes, isActive)',
  'POST /api/projects/:id/phases': 'Add a phase (name, color)',
  'PUT /api/projects/:id/phases/order': 'Reorder phases (phaseIds)',
  'PATCH /api/projects/:id/phases/:phaseId': 'Rename/recolor a phase',
  'DELETE /api/projects/:id/phases/:phaseId': 'Delete a phase (tasks are kept)',
  'POST /api/projects/:id/members': 'Add a team member (employeeId, projectRole)',
  'PATCH /api/projects/:id/members/:memberId': "Change a member's project role",
  'DELETE /api/projects/:id/members/:memberId': 'Remove a team member',
  'POST /api/projects/:id/save-as-template': 'Save a project as a template (name, description)',
  'GET /api/project-templates': 'Project templates (locale)',
  'GET /api/project-templates/:id': 'One project template',
  'GET /api/shifts': 'Schedule between two dates (from, to, locationId)',
  'GET /api/shifts/mine': "The acting user's shifts (from, to)",
  'GET /api/shifts/locations': 'Locations',
  'GET /api/shifts/availability': "The acting user's availability",
  'GET /api/shifts/cost': 'Labor cost of the schedule (from, to, locationId)',
  'GET /api/shifts/skills': 'Skills and holders',
  'GET /api/shifts/templates': 'Shift templates',
  'GET /api/shifts/:shiftId/candidates': 'Who could work a shift',
  'POST /api/shifts': 'Create a draft shift',
  'PATCH /api/shifts/:shiftId': 'Change a shift (AI assistants: drafts only)',
  'DELETE /api/shifts/:shiftId': 'Delete a shift (AI assistants: drafts only)',
  'POST /api/shifts/:shiftId/assignments': 'Assign people (employeeIds, force) (AI assistants: drafts only)',
  'DELETE /api/shifts/:shiftId/assignments/:id': 'Unassign (AI assistants: drafts only)',
  'POST /api/shifts/assignments/:id/respond': 'Accept or decline own assignment (response, reason)',
  'POST /api/shifts/availability': 'Add an availability rule',
  'DELETE /api/shifts/availability/:id': 'Remove an availability rule',
  'POST /api/shifts/publish': 'Publish draft shifts (shiftIds) — notifies people',
  'POST /api/shifts/:shiftId/cancel': 'Cancel a published shift — notifies people',
  'POST /api/shifts/copy-week': 'Copy a week as drafts (fromWeekStart, toWeekStart, locationId)',
  'GET /api/shifts/available': 'Open shifts the acting user could claim',
  'GET /api/shifts/requests': 'Give-away/swap requests (scope=manage for managers)',
  'GET /api/shifts/assignments/:id/swap-targets': 'Shifts an assignment could be swapped with',
  'POST /api/shifts/:shiftId/open': 'Open/close a shift to anyone (open)',
  'POST /api/shifts/:shiftId/claim': 'Claim an open shift',
  'POST /api/shifts/assignments/:id/give': 'Offer own assignment to others (reason)',
  'POST /api/shifts/assignments/:id/swap': 'Ask to swap (targetAssignmentId, reason)',
  'POST /api/shifts/requests/:id/take': "Take someone's given-away shift",
  'POST /api/shifts/requests/:id/answer': 'Answer a swap sent to you (accept)',
  'POST /api/shifts/requests/:id/decide': 'Manager decision on a request (approve, note)',
  'POST /api/shifts/requests/:id/cancel': 'Cancel own request',
  'GET /api/shifts/timesheet': 'A week timesheet (employeeId, weekStart)',
  'GET /api/shifts/timesheet/approvals': 'Timesheets waiting for approval (status, weekStart)',
  'GET /api/shifts/timesheet/reports': 'Hours report (from, to, groupBy)',
  'POST /api/shifts/timesheet/entries': 'Log time',
  'PATCH /api/shifts/timesheet/entries/:id': 'Change a time entry',
  'DELETE /api/shifts/timesheet/entries/:id': 'Delete a time entry',
  'POST /api/shifts/timesheet/submit': 'Submit a week (weekStart)',
  'POST /api/shifts/timesheet/suggestions/dismiss': 'Dismiss a suggestion (sourceType, sourceId)',
  'POST /api/shifts/timesheet/suggestions/restore': 'Restore a suggestion (sourceType, sourceId)',
  'POST /api/shifts/timesheet/:id/decision': 'Approve or return a timesheet (decision, note)',
  'POST /api/shifts/timesheet/:id/reopen': 'Reopen an approved timesheet (reason)',
  'POST /api/shifts/timesheet/:id/adjustments': 'Adjust an approved timesheet (minutes, reason, description)',
  'GET /api/shifts/client-reports/defaults': "A client company's projects and contact e-mail",
  'POST /api/shifts/client-reports': 'Client hours report link; e-mails it with email (companyId, projectId, from, to, showPeople, email, lang)',
  'GET /api/clock/me': "The acting user's clock status",
  'GET /api/clock/board': "Location managers' clock board (locationId)",
  'GET /api/clock/entries/:id/corrections': "A clock entry's corrections",
  'POST /api/clock/in': 'Clock in as the acting user (locationId or code)',
  'POST /api/clock/out': 'Clock out (breakMinutes)',
  'POST /api/clock/break/:action': 'Start or end a break (start|end)',
  'PATCH /api/clock/entries/:id': 'Correct a clock entry (clockInAt, clockOutAt, breakMinutes, markReviewed, reason)',
};

function tagFor(source: string): string {
  if (/^\/api\/(projects|project-templates)/.test(source)) return 'Projects';
  if (/^\/api\/clock/.test(source)) return 'Clock';
  if (/^\/api\/shifts\/(timesheet|client-reports)/.test(source)) return 'Timesheets';
  if (/^\/api\/shifts/.test(source)) return 'Shifts';
  if (/time-off|religious/.test(source)) return 'Time off';
  if (/pay-frequencies|payment-methods|payroll|compensation|payment-history/.test(source)) return 'Payroll';
  if (/^\/api\/(tasks|task-folders)/.test(source) && !source.includes('mentionable')) return 'Tasks';
  if (/^\/api\/notifications/.test(source)) return 'Notifications';
  if (/^\/api\/activity/.test(source)) return 'Activity';
  if (/^\/api\/tags\//.test(source) || /custom-fields\//.test(source) || /^\/api\/(companies|contacts|opportunities|hr\/employees)\/:id/.test(source)) return 'Record extras';
  return 'Workspace';
}

const openapi = JSON.parse(fs.readFileSync(OPENAPI_PATH, 'utf8'));
for (const [key, item] of Object.entries<any>(openapi.paths)) {
  for (const method of Object.keys(item)) if (item[method]?.['x-delegated']) delete item[method];
  if (Object.keys(item).length === 0) delete openapi.paths[key];
}

const missing: string[] = [];
for (const route of DELEGATED_ROUTES) {
  const external = route.source.replace(/^\/api/, '').replace(/:([a-zA-Z]+)/g, '{$1}');
  const key = `${route.method} ${route.source}`;
  const summary = SUMMARIES[key];
  if (!summary) missing.push(key);
  const scope = typeof route.scope === 'string' ? `\`${route.scope}\`` : "the record's own scope (e.g. `crm.companies:write` for a company)";
  const params = [...external.matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
  openapi.paths[external] ??= {};
  openapi.paths[external][route.method.toLowerCase()] = {
    'x-delegated': true,
    tags: [tagFor(route.source)],
    summary: summary ?? key,
    description:
      `Requires ${scope}${route.aiOnly ? ' and an AI assistant token' : ''}. Served by the app's own route, running as the acting user: same request body, response and rules as in the app. Errors are \`{ error }\` (plus \`code\` where the app sets one).`,
    ...(params.length ? { parameters: params } : {}),
    ...(['POST', 'PATCH', 'PUT'].includes(route.method) ? { requestBody: { required: false, content: { 'application/json': { schema: { type: 'object' } } } } } : {}),
    responses: {
      '200': { description: 'OK (201 on create, 204 on delete)' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '404': { $ref: '#/components/responses/NotFound' },
    },
  };
}

const tagNames = new Set(openapi.tags.map((t: { name: string }) => t.name));
for (const route of DELEGATED_ROUTES) {
  const tag = tagFor(route.source);
  if (!tagNames.has(tag)) {
    openapi.tags.push({ name: tag });
    tagNames.add(tag);
  }
}

fs.writeFileSync(OPENAPI_PATH, `${JSON.stringify(openapi, null, 2)}\n`);
console.log(`${DELEGATED_ROUTES.length} delegated endpoints written.`);
if (missing.length) {
  console.error(`No summary for:\n${missing.join('\n')}`);
  process.exitCode = 1;
}
