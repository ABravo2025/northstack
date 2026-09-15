import prisma from '../../lib/prisma.js';
import { createFieldCatalogDefinition } from '../hr/fieldCatalogService.js';
import { createEmployee } from '../hr/employeeService.js';
import { createCompany } from '../crm/companyService.js';

const SAMPLE_DEPARTMENTS = ['Engineering', 'Sales', 'Operations'];
const SAMPLE_JOB_TITLES = ['Software Engineer', 'Account Executive', 'Operations Manager'];

const SAMPLE_EMPLOYEES = [
  { firstName: 'Jordan', lastName: 'Vega', department: 'Sales', jobTitle: 'Account Executive' },
  { firstName: 'Mika', lastName: 'Ruiz', department: 'Engineering', jobTitle: 'Software Engineer' },
  { firstName: 'Casey', lastName: 'Ito', department: 'Operations', jobTitle: 'Operations Manager' },
  { firstName: 'Priya', lastName: 'Shah', department: 'Sales', jobTitle: 'Account Executive' },
  { firstName: 'Devon', lastName: 'Cole', department: 'Engineering', jobTitle: 'Software Engineer' },
];

const SAMPLE_COMPANIES = [
  { name: 'Brightline Studio', contactFirstName: 'Alex', contactLastName: 'Morgan' },
  { name: 'Northfield Logistics', contactFirstName: 'Sam', contactLastName: 'Reyes' },
  { name: 'Harbor & Co.', contactFirstName: 'Taylor', contactLastName: 'Kim' },
  { name: 'Ledger Analytics', contactFirstName: 'Robin', contactLastName: 'Patel' },
];

// One-shot "load sample data" action offered at the end of the guided product tour, not a
// migration script — safe to call more than once (it just adds more rows). Companies each get
// their own primary Contact created in the same transaction (createCompany enforces that
// invariant) — this used to call the legacy clientService.createClient instead, which left rows
// in the `Client` model that no page in the frontend renders (CRM moved to Company/Contact
// rounds ago); switched 2026-09-15 so sample data is actually visible in Companies/Contacts.
export async function seedSampleData(
  tenantId: string,
  userId: string,
): Promise<{ employees: number; companies: number }> {
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

  for (const sample of SAMPLE_COMPANIES) {
    const domain = sample.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    await createCompany(
      {
        tenantId,
        name: sample.name,
        contact: {
          firstName: sample.contactFirstName,
          lastName: sample.contactLastName,
          email: `${sample.contactFirstName.toLowerCase()}.${sample.contactLastName.toLowerCase()}@${domain}.example.com`,
        },
      },
      userId,
    );
  }

  return { employees: SAMPLE_EMPLOYEES.length, companies: SAMPLE_COMPANIES.length };
}

// Called when a user finishes OR skips the guided product tour (ProductTour.tsx) — both count as
// "seen", so it never auto-launches again for them. Never cleared back to null: a manual replay
// from the user menu doesn't touch this field.
export async function completeTour(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { productTourCompletedAt: new Date() } });
}
