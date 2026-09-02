import {
  createCustomFieldValue,
  deleteCustomFieldValue,
  findCustomFieldDefinitionById,
  findCustomFieldValueById,
  isValueValidForFieldType,
  listCustomFieldValuesForEntity,
  updateCustomFieldValue,
} from '../modules/hr/customFieldService.js';
import {
  createEmployee,
  deleteEmployee,
  findEmployeeById,
  listEmployeeBirthdaysForCalendar,
  listEmployeeDirectory,
  listEmployees,
  resolveVisibleEmployeeIds,
  updateEmployee,
  wouldCreateManagerCycle,
} from '../modules/hr/employeeService.js';
import {
  assignTimeOffPolicyToEmployee,
  listEmployeeTimeOffPolicies,
  unassignTimeOffPolicyFromEmployee,
} from '../modules/hr/employeeTimeOffPolicyService.js';
import { findFieldCatalogDefinitionById } from '../modules/hr/fieldCatalogService.js';
import { listPaymentHistoryForEmployee } from '../modules/hr/payrollEntryService.js';
import { findStatusDefinitionById } from '../modules/hr/statusService.js';
import { calculateEmployeeTimeOffBalances } from '../modules/hr/timeOffBalanceService.js';
import { cancelTermination, createTermination, getLatestTermination, listDirectReports } from '../modules/hr/terminationService.js';
import { createInvitation } from '../modules/tenant/invitationService.js';
import { recordCustomFieldValueActivity } from '../modules/activity/customFieldActivity.js';
import { employeeDisplayName } from '../modules/activity/fieldConfigs/employeeFieldConfig.js';
import {
  getEmployeeCompensationSummary,
  getEmployeeContractPdf,
  resendEmployeeContract,
} from '../modules/hr/contractPdfService.js';
import {
  canEditEmployeeCustomFields,
  canInviteUsers,
  canManageCustomFields,
  canManageEmployee,
  canManagePayroll,
  canViewEmployee,
  canViewEmployeeCustomFields,
} from '../modules/auth/permissionService.js';
import { redactEntityFields, redactEntityListFields } from '../modules/auth/fieldVisibilityService.js';
import { exportEmployeesToCsv, getEmployeesCsvTemplate, importEmployeesFromCsv } from '../modules/csv/csvService.js';
import { validateSession } from '../lib/httpAuth.js';
import type { AuthenticatedUser } from '../modules/auth/authService.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

const VALID_CONTRACT_TYPES = ['part_time', 'full_time'];
const VALID_PERSON_TYPES = ['profile', 'contractor', 'employee'];

export const employeesRouter = createAsyncRouter();

// Custom Roles Fase E — the detail/edit/delete counterpart to the list route's scope filter above:
// an Employee outside the acting user's scope should behave exactly like one in a different tenant
// (404, never 403 — see the plan's decision 5, same criterion as an ownership check). Only checked
// for detail/PATCH/DELETE, the 3 routes that answer "can this actor touch this specific employee" —
// deliberately not extended to every sub-resource route (compensation, contract PDF, time-off
// policies, termination, etc.): those are gated by canManagePayroll/canManageCustomFields, tiers
// that are owner-only or pre-existing-quirky in practice today and out of scope for this pass.
async function isEmployeeInScope(user: AuthenticatedUser, employeeId: string): Promise<boolean> {
  const visibleIds = await resolveVisibleEmployeeIds(user.tenantId!, user.roleContext, user.id);
  return visibleIds === null || visibleIds.has(employeeId);
}

employeesRouter.get('/api/hr/employees', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewEmployee(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const visibleIds = await resolveVisibleEmployeeIds(user.tenantId!, user.roleContext, user.id);
  const employees = await listEmployees(user.tenantId, visibleIds);
  return res.json(redactEntityListFields(employees, 'employee', user.roleContext));
});

// Custom Roles Fase E, decision 6 — the "directory tier": basic identity fields (name, department,
// job title, manager) for EVERY employee in the tenant, deliberately NOT filtered by HR scope and
// NOT gated by canViewEmployee. Feeds pickers that need to point at anyone in the company (manager
// selection, the Task "who is this for" entity picker, termination reassignment) regardless of the
// caller's own scope or HR permissions — a Member with zero HR access still needs to pick a
// coworker's name for a Task. Never carries PII; the real GET /api/hr/employees (above) is where
// scope + field-level restriction apply.
employeesRouter.get('/api/hr/employees/directory', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const directory = await listEmployeeDirectory(user.tenantId);
  return res.json(directory);
});

employeesRouter.get('/api/hr/employees/birthdays', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewEmployee(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const birthdays = await listEmployeeBirthdaysForCalendar(user.tenantId!);
  return res.json(birthdays);
});

employeesRouter.get('/api/hr/employees/export/csv', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  // Fase B (Custom Roles) — tied to Payroll, not the base view_employee permission: the export
  // contains a full HR extract (compensation-adjacent PII included) sensitive enough to warrant
  // the same bar as Payroll itself, not just "can see the employee list."
  if (!canManagePayroll(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const csv = await exportEmployeesToCsv(user.tenantId!);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="employees.csv"');
  return res.send(csv);
});

employeesRouter.post('/api/hr/employees/import/csv', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  // Fase B (Custom Roles) — same reasoning as the export route above.
  if (!canManagePayroll(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (typeof req.body.csv !== 'string' || !req.body.csv.trim()) {
    return res.status(400).json({ error: 'csv is required' });
  }

  const result = await importEmployeesFromCsv(user.tenantId!, req.body.csv, user.id);
  return res.json(result);
});

employeesRouter.get('/api/hr/employees/template/csv', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  // Fase B (Custom Roles) — same reasoning as the export route above.
  if (!canManagePayroll(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const csv = await getEmployeesCsvTemplate(user.tenantId!);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="employees-import-template.csv"');
  return res.send(csv);
});

employeesRouter.post('/api/hr/employees', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageEmployee(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (req.body.contractType !== undefined && req.body.contractType !== null && !VALID_CONTRACT_TYPES.includes(req.body.contractType)) {
    return res.status(400).json({ error: 'Invalid contract type' });
  }

  if (req.body.personType !== undefined && req.body.personType !== null && !VALID_PERSON_TYPES.includes(req.body.personType)) {
    return res.status(400).json({ error: 'Invalid person type' });
  }

  if (req.body.managerId) {
    const manager = await findEmployeeById(req.body.managerId);
    if (!manager || manager.tenantId !== user.tenantId) {
      return res.status(400).json({ error: 'Manager not found' });
    }
  }

  if (req.body.departmentId) {
    const department = await findFieldCatalogDefinitionById(req.body.departmentId);
    if (!department || department.tenantId !== user.tenantId || department.kind !== 'department') {
      return res.status(400).json({ error: 'Department not found' });
    }
  }

  if (req.body.jobTitleId) {
    const jobTitle = await findFieldCatalogDefinitionById(req.body.jobTitleId);
    if (!jobTitle || jobTitle.tenantId !== user.tenantId || jobTitle.kind !== 'jobTitle') {
      return res.status(400).json({ error: 'Job title not found' });
    }
  }

  const employee = await createEmployee({ ...req.body, tenantId: user.tenantId! }, user.id);
  return res.status(201).json(redactEntityFields(employee, 'employee', user.roleContext));
});

employeesRouter.get('/api/hr/employees/:employeeId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewEmployee(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId || !(await isEmployeeInScope(user, employee.id))) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  return res.json(redactEntityFields(employee, 'employee', user.roleContext));
});

employeesRouter.patch('/api/hr/employees/:employeeId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageEmployee(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (req.body.contractType !== undefined && req.body.contractType !== null && !VALID_CONTRACT_TYPES.includes(req.body.contractType)) {
    return res.status(400).json({ error: 'Invalid contract type' });
  }

  if (req.body.personType !== undefined && req.body.personType !== null && !VALID_PERSON_TYPES.includes(req.body.personType)) {
    return res.status(400).json({ error: 'Invalid person type' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId || !(await isEmployeeInScope(user, employee.id))) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  // The frontend hides the Status field once an employee is Terminated, but that's UI-only —
  // without this, any HR-permissioned caller could PATCH statusId back to Active directly and
  // reopen the door to a second real termination (and a second final payment) on the same person.
  if (req.body.statusId !== undefined && req.body.statusId !== employee.statusId) {
    const currentStatus = await findStatusDefinitionById(employee.statusId);
    if (currentStatus?.isTerminatedStatus) {
      return res.status(400).json({ error: 'Cannot change the status of a terminated employee' });
    }
  }

  if (req.body.managerId) {
    const manager = await findEmployeeById(req.body.managerId);
    if (!manager || manager.tenantId !== user.tenantId) {
      return res.status(400).json({ error: 'Manager not found' });
    }

    const wouldCycle = await wouldCreateManagerCycle(req.params.employeeId, req.body.managerId);
    if (wouldCycle) {
      return res.status(400).json({ error: 'This would create a reporting cycle' });
    }
  }

  if (req.body.statusId !== undefined) {
    const status = await findStatusDefinitionById(req.body.statusId);
    if (!status || status.tenantId !== user.tenantId) {
      return res.status(400).json({ error: 'Status not found' });
    }
  }

  if (req.body.departmentId) {
    const department = await findFieldCatalogDefinitionById(req.body.departmentId);
    if (!department || department.tenantId !== user.tenantId || department.kind !== 'department') {
      return res.status(400).json({ error: 'Department not found' });
    }
  }

  if (req.body.jobTitleId) {
    const jobTitle = await findFieldCatalogDefinitionById(req.body.jobTitleId);
    if (!jobTitle || jobTitle.tenantId !== user.tenantId || jobTitle.kind !== 'jobTitle') {
      return res.status(400).json({ error: 'Job title not found' });
    }
  }

  const updated = await updateEmployee(req.params.employeeId, req.body, user.id);
  return res.json(redactEntityFields(updated, 'employee', user.roleContext));
});

employeesRouter.delete('/api/hr/employees/:employeeId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageEmployee(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId || !(await isEmployeeInScope(user, employee.id))) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  await deleteEmployee(req.params.employeeId, user.id);
  return res.status(204).end();
});

// Everything the "Terminate" modal needs in one call — whether there's already a pending
// scheduled termination to show instead of the form, and the direct reports list to build the
// optional reassignment pickers.
employeesRouter.get('/api/hr/employees/:employeeId/termination', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canManageEmployee(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const [pendingTermination, directReports] = await Promise.all([
    getLatestTermination(req.params.employeeId),
    listDirectReports(req.params.employeeId),
  ]);
  return res.json({
    pendingTermination: pendingTermination && !pendingTermination.executedAt ? pendingTermination : null,
    directReports,
  });
});

employeesRouter.post('/api/hr/employees/:employeeId/termination', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canManageEmployee(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  if (!req.body?.terminationDate) {
    return res.status(400).json({ error: 'terminationDate is required' });
  }

  // Final payment touches Payroll (Unit 18/19's off-cycle entries), which is owner-only visibility
  // everywhere else in the app — enforced here too, not just hidden client-side.
  if (req.body?.finalPayment && !canManagePayroll(user.roleContext)) {
    return res.status(403).json({ error: 'Only the workspace owner can include a final payment' });
  }

  try {
    const result = await createTermination({
      tenantId: user.tenantId!,
      employeeId: req.params.employeeId,
      terminationDate: req.body.terminationDate,
      revokeAccess: req.body.revokeAccess === true,
      createdByUserId: user.id,
      reassignments: Array.isArray(req.body.reassignments) ? req.body.reassignments : undefined,
      finalPayment: req.body.finalPayment ?? undefined,
    });
    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

employeesRouter.post('/api/hr/employee-terminations/:terminationId/cancel', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canManageEmployee(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await cancelTermination(req.params.terminationId, user.tenantId!, user.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(204).end();
});

employeesRouter.post('/api/hr/employees/:employeeId/invite', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canInviteUsers(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  if (employee.userId) {
    return res.status(400).json({ error: 'Employee is already linked to a user' });
  }

  const employeeStatus = await findStatusDefinitionById(employee.statusId);
  if (employeeStatus?.isTerminatedStatus) {
    return res.status(400).json({ error: 'Cannot invite a terminated employee' });
  }

  // Optional — lets the inviter pick a real tenant role (Custom Roles Fase I/J) instead of always
  // defaulting to Member, the same as CompanyUsersPage.tsx's "Invite Someone" modal.
  // createInvitation validates it belongs to this tenant and isn't Owner.
  const result = await createInvitation({
    tenantId: user.tenantId!,
    invitedByUserId: user.id,
    email: employee.email,
    role: 'member',
    roleId: typeof req.body?.roleId === 'string' ? req.body.roleId : undefined,
    employeeId: employee.id,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json({ invitation: result.invitation });
});

employeesRouter.get('/api/hr/employees/:employeeId/compensation', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canManagePayroll(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await getEmployeeCompensationSummary(user.tenantId!, req.params.employeeId);
  if (!result.success) {
    return res.status(404).json({ error: result.error });
  }
  return res.json(result.summary);
});

employeesRouter.get('/api/hr/employees/:employeeId/payment-history', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canManagePayroll(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const history = await listPaymentHistoryForEmployee(user.tenantId!, req.params.employeeId);
  return res.json(history);
});

employeesRouter.get('/api/hr/employees/:employeeId/contract-pdf', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canManagePayroll(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await getEmployeeContractPdf(user.tenantId!, req.params.employeeId);
  if (!result.success) {
    return res.status(404).json({ error: result.error });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="contract.pdf"');
  return res.send(Buffer.from(result.pdfBytes!));
});

employeesRouter.post('/api/hr/employees/:employeeId/resend-contract', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canManagePayroll(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await resendEmployeeContract(user.tenantId!, req.params.employeeId, user.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ success: true });
});

employeesRouter.get('/api/hr/employees/:employeeId/time-off-policies', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const assignments = await listEmployeeTimeOffPolicies(user.tenantId!, req.params.employeeId);
  return res.json(assignments);
});

employeesRouter.post('/api/hr/employees/:employeeId/time-off-policies', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const result = await assignTimeOffPolicyToEmployee(user.tenantId!, req.params.employeeId, req.body.timeOffPolicyId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json(result.assignment);
});

employeesRouter.delete('/api/hr/employees/:employeeId/time-off-policies/:policyId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const result = await unassignTimeOffPolicyFromEmployee(user.tenantId!, req.params.employeeId, req.params.policyId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(204).end();
});

employeesRouter.get('/api/hr/employees/:employeeId/time-off-balance', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const isSelf = employee.userId === user.id;
  if (!isSelf && !canManageCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const balances = await calculateEmployeeTimeOffBalances(user.tenantId!, req.params.employeeId);
  return res.json(balances);
});

employeesRouter.post('/api/hr/employees/:employeeId/custom-fields', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canEditEmployeeCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const definition = await findCustomFieldDefinitionById(req.body.customFieldDefinitionId);
  if (!definition || definition.tenantId !== user.tenantId || definition.entityType !== 'employee') {
    return res.status(404).json({ error: 'Custom field definition not found' });
  }

  if (!isValueValidForFieldType(definition.fieldType, req.body.value, definition.options)) {
    return res.status(400).json({ error: `Invalid value for field type '${definition.fieldType}'` });
  }

  const customFieldValue = await createCustomFieldValue({
    tenantId: user.tenantId!,
    customFieldDefinitionId: req.body.customFieldDefinitionId,
    entityType: 'employee',
    entityId: req.params.employeeId,
    value: req.body.value,
  });

  await recordCustomFieldValueActivity({
    tenantId: user.tenantId!,
    entityType: 'employee',
    entityId: req.params.employeeId,
    entityLabel: employeeDisplayName(employee),
    fieldDefinitionId: definition.id,
    fieldName: definition.name,
    oldValue: null,
    newValue: customFieldValue.value,
    changedByUserId: user.id,
  });

  return res.status(201).json(customFieldValue);
});

employeesRouter.patch('/api/hr/employees/:employeeId/custom-fields/:valueId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canEditEmployeeCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const existingValue = await findCustomFieldValueById(req.params.valueId);
  if (
    !existingValue ||
    existingValue.tenantId !== user.tenantId ||
    existingValue.entityType !== 'employee' ||
    existingValue.entityId !== req.params.employeeId
  ) {
    return res.status(404).json({ error: 'Custom field value not found' });
  }

  const definition = await findCustomFieldDefinitionById(existingValue.customFieldDefinitionId);
  if (!definition || !isValueValidForFieldType(definition.fieldType, req.body.value, definition.options)) {
    return res.status(400).json({ error: `Invalid value for field type '${definition?.fieldType}'` });
  }

  const updated = await updateCustomFieldValue(req.params.valueId, req.body.value);

  await recordCustomFieldValueActivity({
    tenantId: user.tenantId!,
    entityType: 'employee',
    entityId: req.params.employeeId,
    entityLabel: employeeDisplayName(employee),
    fieldDefinitionId: definition.id,
    fieldName: definition.name,
    oldValue: existingValue.value,
    newValue: updated.value,
    changedByUserId: user.id,
  });

  return res.json(updated);
});

employeesRouter.delete('/api/hr/employees/:employeeId/custom-fields/:valueId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canEditEmployeeCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const existingValue = await findCustomFieldValueById(req.params.valueId);
  if (
    !existingValue ||
    existingValue.tenantId !== user.tenantId ||
    existingValue.entityType !== 'employee' ||
    existingValue.entityId !== req.params.employeeId
  ) {
    return res.status(404).json({ error: 'Custom field value not found' });
  }

  await deleteCustomFieldValue(req.params.valueId);

  const definition = await findCustomFieldDefinitionById(existingValue.customFieldDefinitionId);
  if (definition) {
    await recordCustomFieldValueActivity({
      tenantId: user.tenantId!,
      entityType: 'employee',
      entityId: req.params.employeeId,
      entityLabel: employeeDisplayName(employee),
      fieldDefinitionId: definition.id,
      fieldName: definition.name,
      oldValue: existingValue.value,
      newValue: null,
      changedByUserId: user.id,
    });
  }

  return res.status(204).end();
});

employeesRouter.get('/api/hr/employees/:employeeId/custom-fields', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewEmployeeCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const values = await listCustomFieldValuesForEntity(user.tenantId!, 'employee', req.params.employeeId);
  return res.json(values);
});
