import prisma from '../../lib/prisma.js';
import { createFieldCatalogDefinition } from '../hr/fieldCatalogService.js';
import { createEmployee } from '../hr/employeeService.js';
import { createClient } from '../clients/clientService.js';

const SAMPLE_DEPARTMENTS = ['Engineering', 'Sales', 'Operations'];
const SAMPLE_JOB_TITLES = ['Software Engineer', 'Account Executive', 'Operations Manager'];

const SAMPLE_EMPLOYEES = [
  { firstName: 'Jordan', lastName: 'Vega', department: 'Sales', jobTitle: 'Account Executive' },
  { firstName: 'Mika', lastName: 'Ruiz', department: 'Engineering', jobTitle: 'Software Engineer' },
  { firstName: 'Casey', lastName: 'Ito', department: 'Operations', jobTitle: 'Operations Manager' },
  { firstName: 'Priya', lastName: 'Shah', department: 'Sales', jobTitle: 'Account Executive' },
  { firstName: 'Devon', lastName: 'Cole', department: 'Engineering', jobTitle: 'Software Engineer' },
];

const SAMPLE_CLIENTS = [
  { firstName: 'Alex', lastName: 'Morgan', company: 'Brightline Studio' },
  { firstName: 'Sam', lastName: 'Reyes', company: 'Northfield Logistics' },
  { firstName: 'Taylor', lastName: 'Kim', company: 'Harbor & Co.' },
  { firstName: 'Robin', lastName: 'Patel', company: 'Ledger Analytics' },
];

// One-shot "load sample data" action for the onboarding checklist, not a
// migration script — safe to call more than once (it just adds more rows),
// the UI prevents re-triggering once real data exists.
export async function seedSampleData(tenantId: string): Promise<{ employees: number; clients: number }> {
  const departments = new Map<string, string>();
  for (let i = 0; i < SAMPLE_DEPARTMENTS.length; i++) {
    const dept = await createFieldCatalogDefinition({ tenantId, kind: 'department', name: SAMPLE_DEPARTMENTS[i], order: i });
    departments.set(SAMPLE_DEPARTMENTS[i], dept.id);
  }

  const jobTitles = new Map<string, string>();
  for (let i = 0; i < SAMPLE_JOB_TITLES.length; i++) {
    const title = await createFieldCatalogDefinition({ tenantId, kind: 'jobTitle', name: SAMPLE_JOB_TITLES[i], order: i });
    jobTitles.set(SAMPLE_JOB_TITLES[i], title.id);
  }

  for (const sample of SAMPLE_EMPLOYEES) {
    await createEmployee({
      tenantId,
      firstName: sample.firstName,
      lastName: sample.lastName,
      email: `${sample.firstName.toLowerCase()}.${sample.lastName.toLowerCase()}@example.com`,
      departmentId: departments.get(sample.department) ?? null,
      jobTitleId: jobTitles.get(sample.jobTitle) ?? null,
    });
  }

  for (const sample of SAMPLE_CLIENTS) {
    await createClient({
      tenantId,
      firstName: sample.firstName,
      lastName: sample.lastName,
      email: `${sample.firstName.toLowerCase()}.${sample.lastName.toLowerCase()}@${sample.company.toLowerCase().replace(/[^a-z0-9]+/g, '')}.example.com`,
      company: sample.company,
    });
  }

  return { employees: SAMPLE_EMPLOYEES.length, clients: SAMPLE_CLIENTS.length };
}

export async function getOnboardingStatus(tenantId: string) {
  const [employeeCount, clientCount, userCount, timeOffPolicyCount] = await Promise.all([
    prisma.employee.count({ where: { tenantId } }),
    prisma.client.count({ where: { tenantId } }),
    prisma.user.count({ where: { tenantId } }),
    prisma.timeOffPolicyDefinition.count({ where: { tenantId } }),
  ]);

  return {
    // Tenant registration auto-creates one Employee record for the owner
    // (see tenantService.ts), so a fresh tenant always has count === 1 —
    // "added your first employee" means someone beyond that.
    hasEmployees: employeeCount > 1,
    hasClients: clientCount > 0,
    hasInvitedTeammate: userCount > 1,
    hasTimeOffPolicy: timeOffPolicyCount > 0,
  };
}
