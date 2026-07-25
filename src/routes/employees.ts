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
  listEmployees,
  updateEmployee,
  wouldCreateManagerCycle,
} from '../modules/hr/employeeService.js';
import {
  assignTimeOffPolicyToEmployee,
  listEmployeeTimeOffPolicies,
  unassignTimeOffPolicyFromEmployee,
} from '../modules/hr/employeeTimeOffPolicyService.js';
import { findFieldCatalogDefinitionById } from '../modules/hr/fieldCatalogService.js';
import { findStatusDefinitionById } from '../modules/hr/statusService.js';
import { calculateEmployeeTimeOffBalances } from '../modules/hr/timeOffBalanceService.js';
import { createInvitation } from '../modules/tenant/tenantService.js';
import {
  canCreateHr,
  canInviteUsers,
  canManageCustomFields,
  canViewHr,
} from '../modules/auth/permissionService.js';
import { exportEmployeesToCsv, getEmployeesCsvTemplate, importEmployeesFromCsv } from '../modules/csv/csvService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

const VALID_CONTRACT_TYPES = ['part_time', 'full_time'];
const VALID_COMPENSATION_TYPES = ['hourly', 'monthly'];

export const employeesRouter = createAsyncRouter();

employeesRouter.get('/api/hr/employees', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employees = await listEmployees(user.tenantId, user.role);
  return res.json(employees);
});

employeesRouter.get('/api/hr/employees/export/csv', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const csv = await exportEmployeesToCsv(user.tenantId!, user.role);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="employees.csv"');
  return res.send(csv);
});

employeesRouter.post('/api/hr/employees/import/csv', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (typeof req.body.csv !== 'string' || !req.body.csv.trim()) {
    return res.status(400).json({ error: 'csv is required' });
  }

  const result = await importEmployeesFromCsv(user.tenantId!, req.body.csv, user.role);
  return res.json(result);
});

employeesRouter.get('/api/hr/employees/template/csv', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const csv = await getEmployeesCsvTemplate(user.tenantId!, user.role);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="employees-import-template.csv"');
  return res.send(csv);
});

employeesRouter.post('/api/hr/employees', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if ((req.body.hourlyRateCents !== undefined || req.body.monthlyRateCents !== undefined) && user.role !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can set compensation' });
  }

  if (req.body.contractType !== undefined && req.body.contractType !== null && !VALID_CONTRACT_TYPES.includes(req.body.contractType)) {
    return res.status(400).json({ error: 'Invalid contract type' });
  }

  if (
    req.body.compensationType !== undefined &&
    req.body.compensationType !== null &&
    !VALID_COMPENSATION_TYPES.includes(req.body.compensationType)
  ) {
    return res.status(400).json({ error: 'Invalid compensation type' });
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

  const employee = await createEmployee({ ...req.body, tenantId: user.tenantId! });
  return res.status(201).json(employee);
});

employeesRouter.get('/api/hr/employees/:employeeId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  return res.json(employee);
});

employeesRouter.patch('/api/hr/employees/:employeeId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if ((req.body.hourlyRateCents !== undefined || req.body.monthlyRateCents !== undefined) && user.role !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can set compensation' });
  }

  if (req.body.contractType !== undefined && req.body.contractType !== null && !VALID_CONTRACT_TYPES.includes(req.body.contractType)) {
    return res.status(400).json({ error: 'Invalid contract type' });
  }

  if (
    req.body.compensationType !== undefined &&
    req.body.compensationType !== null &&
    !VALID_COMPENSATION_TYPES.includes(req.body.compensationType)
  ) {
    return res.status(400).json({ error: 'Invalid compensation type' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
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
  return res.json(updated);
});

employeesRouter.delete('/api/hr/employees/:employeeId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  await deleteEmployee(req.params.employeeId);
  return res.status(204).end();
});

employeesRouter.post('/api/hr/employees/:employeeId/invite', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canInviteUsers(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  if (employee.userId) {
    return res.status(400).json({ error: 'Employee is already linked to a user' });
  }

  const result = await createInvitation({
    tenantId: user.tenantId!,
    invitedByUserId: user.id,
    email: employee.email,
    role: 'member',
    employeeId: employee.id,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json({ invitation: result.invitation });
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

  if (!canManageCustomFields(user.role)) {
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

  if (!canManageCustomFields(user.role)) {
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
  if (!isSelf && !canManageCustomFields(user.role)) {
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

  if (!canManageCustomFields(user.role)) {
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

  return res.status(201).json(customFieldValue);
});

employeesRouter.patch('/api/hr/employees/:employeeId/custom-fields/:valueId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
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
  return res.json(updated);
});

employeesRouter.delete('/api/hr/employees/:employeeId/custom-fields/:valueId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
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
  return res.status(204).end();
});

employeesRouter.get('/api/hr/employees/:employeeId/custom-fields', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const values = await listCustomFieldValuesForEntity(user.tenantId!, 'employee', req.params.employeeId);
  return res.json(values);
});
