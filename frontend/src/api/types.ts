export interface AuthResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    tenantId?: string;
  };
  tenant?: {
    id: string;
    name: string;
    slug: string;
  };
  session?: {
    token: string;
  };
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  personalEmail?: string | null;
  departmentId?: string | null;
  departmentDefn?: { id: string; name: string } | null;
  jobTitleId?: string | null;
  jobTitleDefn?: { id: string; name: string } | null;
  hourlyRateCents?: number | null;
  monthlyRateCents?: number | null;
  contractType?: 'part_time' | 'full_time' | null;
  compensationType?: 'hourly' | 'monthly' | null;
  startDate?: string | null;
  endDate?: string | null;
  contractUrl?: string | null;
  statusId: string;
  statusDefn?: { id: string; name: string; color: string | null };
  managerId?: string | null;
  manager?: { id: string; firstName: string; lastName: string } | null;
  timeOffPolicies?: EmployeeTimeOffPolicyAssignment[];
  activeTimeOffTag?: { policyName: string; color: string | null } | null;
  userId?: string | null;
  customFieldVals?: {
    id: string;
    customFieldDefinitionId: string;
    value: string;
  }[];
}

export interface Company {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  phone: string | null;
  billingAddress: string | null;
  sizeId: string | null;
  sizeDefn?: { id: string; name: string } | null;
  accountOwnerId: string | null;
  accountOwner?: { id: string; firstName: string; lastName: string } | null;
  statusId: string;
  statusDefn?: { id: string; name: string; color: string | null };
  createdAt: string;
  customFieldVals?: {
    id: string;
    customFieldDefinitionId: string;
    value: string;
  }[];
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  companyId: string | null;
  company?: { id: string; name: string } | null;
  title: string | null;
  isPrimary: boolean;
  leadStatus: 'new' | 'contacted' | 'qualified' | 'disqualified' | null;
  leadSourceId: string | null;
  leadSource?: { id: string; name: string } | null;
  createdAt: string;
  customFieldVals?: {
    id: string;
    customFieldDefinitionId: string;
    value: string;
  }[];
}

export interface PipelineStage {
  id: string;
  pipelineId: string;
  name: string;
  color: string | null;
  order: number;
  outcome: 'open' | 'won' | 'lost';
  isActive: boolean;
}

export interface Pipeline {
  id: string;
  name: string;
  type: 'lead' | 'account';
  order: number;
  isActive: boolean;
  createdAt: string;
  stages: PipelineStage[];
}

export interface OpportunityContactLink {
  id: string;
  contactId: string;
  role: string | null;
  contact: { id: string; firstName: string; lastName: string; email: string };
}

export interface Opportunity {
  id: string;
  name: string;
  companyId: string;
  company?: { id: string; name: string };
  pipelineId: string;
  pipeline?: { id: string; name: string; type: 'lead' | 'account'; isActive: boolean };
  stageId: string;
  stage?: PipelineStage;
  amountCents: number;
  currency: string;
  estimatedCloseDate: string | null;
  ownerId: string;
  owner?: { id: string; firstName: string; lastName: string };
  lossReasonId: string | null;
  nextStepDate: string | null;
  nextStepNote: string | null;
  createdAt: string;
  contactLinks?: OpportunityContactLink[];
  stageHistory?: { id: string; stageId: string; enteredAt: string }[];
}

export type TaskEntityType = 'employee' | 'company' | 'contact' | 'opportunity';

export interface Task {
  id: string;
  tenantId: string;
  entityType: TaskEntityType;
  entityId: string;
  title: string;
  description: string | null;
  assigneeId: string;
  assignee?: { id: string; firstName: string; lastName: string };
  dueDate: string | null;
  completedAt: string | null;
  createdById: string;
  createdBy?: { id: string; firstName: string; lastName: string };
  createdAt: string;
  updatedAt: string;
  // Only present on listMyTasks/listTasksForCalendar — a readable label for
  // the entity the task is about, so the frontend doesn't have to resolve
  // Company/Contact/Employee/Opportunity separately just to display it.
  entitySummary?: string | null;
}

export interface Note {
  id: string;
  tenantId: string;
  entityType: TaskEntityType;
  entityId: string;
  title: string;
  description: string;
  createdById: string;
  createdBy?: { id: string; firstName: string; lastName: string };
  createdAt: string;
  updatedAt: string;
}

export interface CustomFieldDefinition {
  id: string;
  name: string;
  entityType: string;
  fieldType: string;
  options: string | null;
  required: boolean;
  isActive: boolean;
}

export interface StatusDefinition {
  id: string;
  entityType: string;
  name: string;
  color: string | null;
  order: number;
  isDefault: boolean;
  isActive: boolean;
}

export type CatalogKind = 'department' | 'jobTitle' | 'leadSource' | 'lossReason' | 'companySize';

export interface FieldCatalogDefinition {
  id: string;
  kind: CatalogKind;
  name: string;
  order: number;
  isActive: boolean;
}

export interface TimeOffPolicy {
  id: string;
  name: string;
  color: string | null;
  accrualMethod: 'fixed_annual' | 'monthly';
  daysPerYear: number;
  isPaid: boolean;
  requiresApproval: boolean;
  isActive: boolean;
}

export interface EmployeeTimeOffPolicyAssignment {
  id: string;
  employeeId: string;
  timeOffPolicyId: string;
  assignedAt: string;
  timeOffPolicy: TimeOffPolicy;
}

export interface TimeOffBalance {
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  timeOffPolicyId: string;
  policyName: string;
  color: string | null;
  accrualMethod: 'fixed_annual' | 'monthly';
  daysPerYear: number;
  allocated: number;
  used: number;
  pending: number;
  remaining: number;
}

export interface TimeOffRequest {
  id: string;
  employeeId: string;
  timeOffPolicyId: string;
  startDate: string;
  endDate: string;
  daysRequested: number;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approverId: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  timeOffPolicy: TimeOffPolicy;
  employee?: { id: string; firstName: string; lastName: string };
  approver?: { id: string; firstName: string; lastName: string } | null;
}

export interface EmployeeCompensation {
  id: string;
  employeeId: string;
  compensationType: 'hourly' | 'fixed';
  rateCents: number;
  currency: string;
  payFrequencyId: string;
  payFrequency: { id: string; name: string; cadence: 'weekly' | 'biweekly' | 'monthly' };
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
  createdByUserId: string;
  createdBy?: { id: string; firstName: string; lastName: string };
  createdAt: string;
}

export interface PayrollEntry {
  id: string;
  employeeId: string;
  runId: string | null;
  type: 'base' | 'bonus' | 'commission' | 'reimbursement' | 'deduction';
  amountCents: number;
  currency: string;
  hoursQty: number | null;
  label: string | null;
  paymentDate: string;
  createdAt: string;
  employee?: { id: string; firstName: string; lastName: string };
}

export interface PayrollRun {
  id: string;
  payFrequencyId: string | null;
  payFrequency: { id: string; name: string; cadence: 'weekly' | 'biweekly' | 'monthly' } | null;
  periodLabel: string;
  status: 'draft' | 'confirmed';
  createdByUserId: string;
  createdBy: { id: string; firstName: string; lastName: string };
  confirmedAt: string | null;
  createdAt: string;
}

export interface PayrollRunEmployeeGroup {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    statusDefn: { id: string; name: string; color: string | null; isDefault: boolean };
  };
  compensationType: 'hourly' | 'fixed' | null;
  hourlyRateCents: number | null;
  statusSince: string | null;
  base: PayrollEntry | null;
  adjustments: PayrollEntry[];
  total: number;
}

export interface PayrollRunDetail extends PayrollRun {
  employeeGroups: PayrollRunEmployeeGroup[];
}

export interface PayFrequency {
  id: string;
  name: string;
  cadence: 'weekly' | 'biweekly' | 'monthly';
  payAnchor: string;
  isActive: boolean;
  order: number;
  assignedCount: number;
}

export interface Invitation {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  token: string;
  status: string;
  employeeId?: string | null;
  expiresAt: string;
}

export interface CustomFieldValue {
  id: string;
  customFieldDefinitionId: string;
  entityType?: string;
  entityId?: string;
  value: string;
}

export interface TenantUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  status: string;
}

export interface TenantInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  token: string;
  createdAt: string;
  expiresAt: string;
}

export interface ViewFilter {
  field: string;
  operator: string;
  value: string;
}

export interface ViewSort {
  field: string;
  direction: 'asc' | 'desc';
}

export interface SavedView {
  id: string;
  tenantId: string;
  entityType: 'employee' | 'client' | 'company' | 'contact';
  createdByUserId: string;
  name: string;
  type: 'grid' | 'kanban' | 'list';
  visibility: 'personal' | 'shared';
  filters: string | null;
  sortBy: string | null;
  groupByField: string | null;
  createdAt: string;
}

export interface PublicFormFieldConfig {
  key: string;
  required: boolean;
}

export interface Form {
  id: string;
  tenantId: string;
  entityType: 'employee' | 'client' | 'contact';
  name: string;
  slug: string;
  fieldsConfig: string;
  thankYouMessage: string | null;
  isActive: boolean;
  accessMode: 'public' | 'internal';
  pipelineId: string | null;
  createdAt: string;
}

export interface PublicFormCustomFieldDef {
  id: string;
  name: string;
  fieldType: string;
  options: string | null;
  required: boolean;
}

export interface PublicFormConfig {
  id: string;
  name: string;
  entityType: 'employee' | 'client' | 'contact';
  fields: PublicFormFieldConfig[];
  customFieldDefs: PublicFormCustomFieldDef[];
  departmentOptions: { id: string; name: string }[];
  thankYouMessage: string | null;
}
