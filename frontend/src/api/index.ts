import { authApi } from './auth.js';
import { tenantUsersApi } from './tenantUsers.js';
import { employeesApi } from './employees.js';
import { customFieldsApi } from './customFields.js';
import { statusesApi } from './statuses.js';
import { fieldCatalogApi } from './fieldCatalog.js';
import { timeOffPoliciesApi } from './timeOffPolicies.js';
import { timeOffPolicyAssignmentsApi } from './timeOffPolicyAssignments.js';
import { timeOffRequestsApi } from './timeOffRequests.js';
import { timeOffBalancesApi } from './timeOffBalances.js';
import { companiesApi } from './companies.js';
import { contactsApi } from './contacts.js';
import { pipelinesApi } from './pipelines.js';
import { opportunitiesApi } from './opportunities.js';
import { savedViewsApi } from './savedViews.js';
import { publicFormsAdminApi } from './publicFormsAdmin.js';
import { publicFormsPublicApi } from './publicFormsPublic.js';
import { feedbackApi } from './feedback.js';
import { onboardingApi } from './onboarding.js';
import { csvApi } from './csv.js';
import { tasksApi } from './tasks.js';
import { notesApi } from './notes.js';
import { payFrequenciesApi } from './payFrequencies.js';
import { employeeCompensationApi } from './employeeCompensation.js';

export { ApiError } from './http.js';
export * from './types.js';

export const api = {
  ...authApi,
  ...tenantUsersApi,
  ...employeesApi,
  ...customFieldsApi,
  ...statusesApi,
  ...fieldCatalogApi,
  ...timeOffPoliciesApi,
  ...timeOffPolicyAssignmentsApi,
  ...timeOffRequestsApi,
  ...timeOffBalancesApi,
  ...companiesApi,
  ...contactsApi,
  ...pipelinesApi,
  ...opportunitiesApi,
  ...savedViewsApi,
  ...publicFormsAdminApi,
  ...publicFormsPublicApi,
  ...feedbackApi,
  ...onboardingApi,
  ...csvApi,
  ...tasksApi,
  ...notesApi,
  ...payFrequenciesApi,
  ...employeeCompensationApi,
};
