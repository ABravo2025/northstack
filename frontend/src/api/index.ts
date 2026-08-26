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
import { pipelineAssignmentsApi } from './pipelineAssignments.js';
import { opportunitiesApi } from './opportunities.js';
import { savedViewsApi } from './savedViews.js';
import { publicFormsAdminApi } from './publicFormsAdmin.js';
import { publicFormsPublicApi } from './publicFormsPublic.js';
import { feedbackApi } from './feedback.js';
import { onboardingApi } from './onboarding.js';
import { csvApi } from './csv.js';
import { tasksApi } from './tasks.js';
import { notesApi } from './notes.js';
import { notificationsApi } from './notifications.js';
import { payrollApi } from './payroll.js';
import { contractConfirmationPublicApi } from './contractConfirmationPublic.js';
import { billingApi } from './billing.js';
import { integrationsApi } from './integrations.js';
import { paymentsApi } from './payments.js';

export { ApiError, API_BASE_URL } from './http.js';
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
  ...pipelineAssignmentsApi,
  ...opportunitiesApi,
  ...savedViewsApi,
  ...publicFormsAdminApi,
  ...publicFormsPublicApi,
  ...feedbackApi,
  ...onboardingApi,
  ...csvApi,
  ...tasksApi,
  ...notesApi,
  ...notificationsApi,
  ...payrollApi,
  ...contractConfirmationPublicApi,
  ...billingApi,
  ...integrationsApi,
  ...paymentsApi,
};
