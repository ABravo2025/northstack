import type { ActivityFieldConfigMap } from '../activityLogService.js';
import { resolveCatalogName, resolveEmployeeName, resolveStatusName } from './resolvers.js';

export const employeeActivityFieldConfig: ActivityFieldConfigMap = {
  firstName: { label: 'First name' },
  lastName: { label: 'Last name' },
  email: { label: 'Email' },
  departmentId: { label: 'Department', resolve: resolveCatalogName },
  jobTitleId: { label: 'Job title', resolve: resolveCatalogName },
  contractType: { label: 'Contract type' },
  personType: { label: 'Type' },
  nationality: { label: 'Nationality' },
  startDate: { label: 'Start date' },
  endDate: { label: 'End date' },
  birthdate: { label: 'Birthdate' },
  contractUrl: { label: 'Contract URL' },
  personalEmail: { label: 'Personal email' },
  statusId: { label: 'Status', resolve: resolveStatusName },
  // Self-referential (Employee.managerId -> Employee) — resolveEmployeeName queries Prisma
  // directly rather than employeeService.findEmployeeById to sidestep an import cycle with this
  // very file's caller (employeeService.ts).
  managerId: { label: 'Manager', resolve: resolveEmployeeName },
};

export function employeeDisplayName(record: { firstName: string; lastName: string }): string {
  return `${record.firstName} ${record.lastName}`;
}
