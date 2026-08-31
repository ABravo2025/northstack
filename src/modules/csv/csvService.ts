import prisma from '../../lib/prisma.js';
import { toCsv, parseCsv, rowsToRecords, getField } from '../../lib/csv.js';
import { createEmployee } from '../hr/employeeService.js';
import { createClient } from '../clients/clientService.js';
import { findOrCreateFieldCatalogDefinition } from '../hr/fieldCatalogService.js';
import { listStatusDefinitions } from '../hr/statusService.js';
import { listCustomFieldDefinitions, listCustomFieldValuesForEntities, createCustomFieldValue, isValueValidForFieldType } from '../hr/customFieldService.js';
import { recordCustomFieldValueActivity } from '../activity/customFieldActivity.js';
import { employeeDisplayName } from '../activity/fieldConfigs/employeeFieldConfig.js';

export interface ImportError {
  row: number;
  message: string;
}

export interface ImportResult {
  created: number;
  errors: ImportError[];
}

function toDateOrUndefined(value: string): string | undefined {
  if (!value.trim()) return undefined;
  return Number.isNaN(Date.parse(value)) ? undefined : value.trim();
}

const EMPLOYEE_BASE_HEADERS = [
  'First Name',
  'Last Name',
  'Business Email',
  'Personal Email',
  'Person Type',
  'Nationality',
  'Birthdate',
  'Department',
  'Job Title',
  'Status',
  'Start Date',
  'End Date',
  'Contract URL',
  'Manager Email',
  'Contract Type',
];

// Country of Residence is deliberately NOT a CSV column: it's set only via the
// self-service contract-confirmation flow (contractConfirmationService.ts) — the owner/admin
// running an import has no legitimate path to set it, same as they can't set it from any form.

const CONTRACT_TYPE_LABELS: Record<string, string> = { part_time: 'Part Time', full_time: 'Full Time' };

function contractTypeFromLabel(label: string): 'part_time' | 'full_time' | undefined {
  const normalized = label.trim().toLowerCase().replace(/\s+/g, '_');
  return normalized === 'part_time' || normalized === 'full_time' ? normalized : undefined;
}

const PERSON_TYPE_LABELS: Record<string, string> = { profile: 'Profile', contractor: 'Contractor', employee: 'Employee' };

function personTypeFromLabel(label: string): 'profile' | 'contractor' | 'employee' | undefined {
  const normalized = label.trim().toLowerCase();
  return normalized === 'profile' || normalized === 'contractor' || normalized === 'employee' ? normalized : undefined;
}

export async function exportEmployeesToCsv(tenantId: string): Promise<string> {
  const employees = await prisma.employee.findMany({
    where: { tenantId },
    include: { departmentDefn: true, jobTitleDefn: true, statusDefn: true, manager: true },
    orderBy: { createdAt: 'asc' },
  });
  const customFields = await listCustomFieldDefinitions(tenantId, 'employee');
  const activeCustomFields = customFields.filter((f) => f.isActive);
  const values = await listCustomFieldValuesForEntities(tenantId, 'employee', employees.map((e) => e.id));

  const headers = [...EMPLOYEE_BASE_HEADERS, ...activeCustomFields.map((f) => f.name)];

  const rows = employees.map((emp) => {
    const base = [
      emp.firstName,
      emp.lastName,
      emp.email,
      emp.personalEmail ?? '',
      emp.personType ? PERSON_TYPE_LABELS[emp.personType] : '',
      emp.nationality ?? '',
      emp.birthdate ? emp.birthdate.toISOString().slice(0, 10) : '',
      emp.departmentDefn?.name ?? '',
      emp.jobTitleDefn?.name ?? '',
      emp.statusDefn?.name ?? '',
      emp.startDate ? emp.startDate.toISOString().slice(0, 10) : '',
      emp.endDate ? emp.endDate.toISOString().slice(0, 10) : '',
      emp.contractUrl ?? '',
      emp.manager?.email ?? '',
      emp.contractType ? CONTRACT_TYPE_LABELS[emp.contractType] : '',
    ];
    const customFieldCells = activeCustomFields.map(
      (f) => values.find((v) => v.entityId === emp.id && v.customFieldDefinitionId === f.id)?.value ?? '',
    );
    return [...base, ...customFieldCells];
  });

  return toCsv([headers, ...rows]);
}

export async function getEmployeesCsvTemplate(tenantId: string): Promise<string> {
  const customFields = (await listCustomFieldDefinitions(tenantId, 'employee')).filter((f) => f.isActive);

  const headers = [...EMPLOYEE_BASE_HEADERS, ...customFields.map((f) => f.name)];
  const example = [
    'Jane',
    'Doe',
    'jane.doe@example.com',
    '',
    'Employee',
    'Argentine',
    '1990-05-20',
    'Engineering',
    'Software Engineer',
    'Active',
    '2026-01-15',
    '',
    '',
    '',
    'Full Time',
    ...customFields.map(() => ''),
  ];

  return toCsv([headers, example]);
}

export async function importEmployeesFromCsv(tenantId: string, csvText: string, changedByUserId: string): Promise<ImportResult> {
  const records = rowsToRecords(parseCsv(csvText));
  const statuses = await listStatusDefinitions(tenantId, 'employee');
  const customFields = (await listCustomFieldDefinitions(tenantId, 'employee')).filter((f) => f.isActive);

  const result: ImportResult = { created: 0, errors: [] };

  for (let i = 0; i < records.length; i++) {
    const rowNumber = i + 2; // +1 for header row, +1 for 1-based
    const record = records[i];
    const firstName = getField(record, 'First Name', 'firstName');
    const lastName = getField(record, 'Last Name', 'lastName');
    const email = getField(record, 'Business Email', 'Email', 'email');

    if (!firstName || !lastName || !email) {
      result.errors.push({ row: rowNumber, message: 'Missing required field (First Name, Last Name, or Business Email)' });
      continue;
    }

    try {
      const departmentName = getField(record, 'Department');
      const departmentId = departmentName
        ? (await findOrCreateFieldCatalogDefinition(tenantId, 'department', departmentName, 0)).id
        : undefined;

      const jobTitleName = getField(record, 'Job Title');
      const jobTitleId = jobTitleName
        ? (await findOrCreateFieldCatalogDefinition(tenantId, 'jobTitle', jobTitleName, 0)).id
        : undefined;

      const statusName = getField(record, 'Status');
      const statusId = statusName
        ? statuses.find((s) => s.name.toLowerCase() === statusName.toLowerCase())?.id
        : undefined;

      const managerEmail = getField(record, 'Manager Email');
      const manager = managerEmail
        ? await prisma.employee.findFirst({ where: { tenantId, email: managerEmail.toLowerCase() } })
        : null;

      const contractTypeLabel = getField(record, 'Contract Type');
      const personTypeLabel = getField(record, 'Person Type');

      const employee = await createEmployee(
        {
          tenantId,
          firstName,
          lastName,
          email,
          personalEmail: getField(record, 'Personal Email') || undefined,
          personType: personTypeLabel ? personTypeFromLabel(personTypeLabel) : undefined,
          nationality: getField(record, 'Nationality') || undefined,
          birthdate: toDateOrUndefined(getField(record, 'Birthdate')),
          departmentId,
          jobTitleId,
          statusId,
          startDate: toDateOrUndefined(getField(record, 'Start Date')),
          endDate: toDateOrUndefined(getField(record, 'End Date')),
          contractUrl: getField(record, 'Contract URL') || undefined,
          managerId: manager?.id,
          contractType: contractTypeLabel ? contractTypeFromLabel(contractTypeLabel) : undefined,
        },
        changedByUserId,
      );

      for (const field of customFields) {
        const raw = getField(record, field.name);
        if (!raw) continue;
        if (!isValueValidForFieldType(field.fieldType, raw, field.options)) continue;
        await createCustomFieldValue({
          tenantId,
          customFieldDefinitionId: field.id,
          entityType: 'employee',
          entityId: employee.id,
          value: raw,
        });
        await recordCustomFieldValueActivity({
          tenantId,
          entityType: 'employee',
          entityId: employee.id,
          entityLabel: employeeDisplayName(employee),
          fieldDefinitionId: field.id,
          fieldName: field.name,
          oldValue: null,
          newValue: raw,
          changedByUserId,
        });
      }

      result.created += 1;
    } catch (error: any) {
      const message = error?.code === 'P2002' ? `An employee with email "${email}" already exists` : error?.message || 'Unknown error';
      result.errors.push({ row: rowNumber, message });
    }
  }

  return result;
}

const CLIENT_BASE_HEADERS = ['First Name', 'Last Name', 'Email', 'Company', 'Status'];

export async function exportClientsToCsv(tenantId: string): Promise<string> {
  const clients = await prisma.client.findMany({
    where: { tenantId },
    include: { statusDefn: true },
    orderBy: { createdAt: 'asc' },
  });
  const customFields = (await listCustomFieldDefinitions(tenantId, 'client')).filter((f) => f.isActive);
  const values = await listCustomFieldValuesForEntities(tenantId, 'client', clients.map((c) => c.id));

  const headers = [...CLIENT_BASE_HEADERS, ...customFields.map((f) => f.name)];
  const rows = clients.map((client) => {
    const base = [client.firstName, client.lastName, client.email, client.company, client.statusDefn?.name ?? ''];
    const customFieldCells = customFields.map(
      (f) => values.find((v) => v.entityId === client.id && v.customFieldDefinitionId === f.id)?.value ?? '',
    );
    return [...base, ...customFieldCells];
  });

  return toCsv([headers, ...rows]);
}

export async function getClientsCsvTemplate(tenantId: string): Promise<string> {
  const customFields = (await listCustomFieldDefinitions(tenantId, 'client')).filter((f) => f.isActive);
  const headers = [...CLIENT_BASE_HEADERS, ...customFields.map((f) => f.name)];
  const example = ['Jane', 'Doe', 'jane.doe@example.com', 'Acme Inc.', 'Active', ...customFields.map(() => '')];
  return toCsv([headers, example]);
}

export async function importClientsFromCsv(tenantId: string, csvText: string): Promise<ImportResult> {
  const records = rowsToRecords(parseCsv(csvText));
  const statuses = await listStatusDefinitions(tenantId, 'client');
  const customFields = (await listCustomFieldDefinitions(tenantId, 'client')).filter((f) => f.isActive);

  const result: ImportResult = { created: 0, errors: [] };

  for (let i = 0; i < records.length; i++) {
    const rowNumber = i + 2;
    const record = records[i];
    const firstName = getField(record, 'First Name', 'firstName');
    const lastName = getField(record, 'Last Name', 'lastName');
    const email = getField(record, 'Email', 'email');
    const company = getField(record, 'Company', 'company');

    if (!firstName || !lastName || !email || !company) {
      result.errors.push({ row: rowNumber, message: 'Missing required field (First Name, Last Name, Email, or Company)' });
      continue;
    }

    try {
      const statusName = getField(record, 'Status');
      const statusId = statusName
        ? statuses.find((s) => s.name.toLowerCase() === statusName.toLowerCase())?.id
        : undefined;

      const client = await createClient({ tenantId, firstName, lastName, email, company, statusId });

      for (const field of customFields) {
        const raw = getField(record, field.name);
        if (!raw) continue;
        if (!isValueValidForFieldType(field.fieldType, raw, field.options)) continue;
        await createCustomFieldValue({
          tenantId,
          customFieldDefinitionId: field.id,
          entityType: 'client',
          entityId: client.id,
          value: raw,
        });
      }

      result.created += 1;
    } catch (error: any) {
      const message = error?.code === 'P2002' ? `A client with email "${email}" already exists` : error?.message || 'Unknown error';
      result.errors.push({ row: rowNumber, message });
    }
  }

  return result;
}
