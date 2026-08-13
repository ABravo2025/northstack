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

export type TenantStatus = 'active' | 'trialing' | 'past_due' | 'suspended' | 'cancelled';
export type PlanTier = 'starter' | 'growth' | 'scale';

// Subscription Plans (spec-subscription-plans.md) — the fields GET/PATCH /api/tenants/current
// added alongside status/plan/companySize, which already existed on the response but weren't
// typed here since nothing on the frontend needed them yet.
export interface Tenant {
  id: string;
  name: string;
  currency: string;
  status: TenantStatus;
  plan: PlanTier | null;
  companySize: string | null;
  trialEndsAt: string | null;
  gracePeriodEndsAt: string | null;
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
  contractType?: 'part_time' | 'full_time' | null;
  personType?: 'profile' | 'contractor' | 'employee' | null;
  nationality?: string | null;
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

// Payroll (docs/spec-payroll.md) — anchorConfig is JSON-encoded server-side,
// its shape depends on cadence (see the spec's Unidad 1 for the 3 shapes).
export type PayFrequencyCadence = 'weekly' | 'semimonthly' | 'monthly';
export type DueDateOffset = 'same_day' | 'plus_2' | 'plus_5' | 'custom';

export interface PayFrequency {
  id: string;
  name: string;
  cadence: PayFrequencyCadence;
  anchorConfig: string;
  dueDateOffset: DueDateOffset;
  dueDateCustomDays: number | null;
  isActive: boolean;
  order: number;
  assignedCount?: number; // only present on the list endpoint
}

export interface PaymentMethod {
  id: string;
  name: string;
  isActive: boolean;
  order: number;
}

export type PayrollCompensationType = 'hourly' | 'fixed';

export interface EmployeeCompensation {
  id: string;
  employeeId: string;
  compensationType: PayrollCompensationType;
  rateCents: number;
  currency: string;
  payFrequencyId: string;
  jobTitle: string;
  description: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
  paymentMethodId: string | null;
  confirmedAt: string | null;
  blocksParticipation: boolean;
  createdAt: string;
}

// Read model for the People overview panel's "Compensation" section — a
// safe subset of EmployeeCompensation (no payment account data, no PDF
// bytes), always the currently-open (effectiveTo: null) row.
export interface EmployeeCompensationSummary {
  compensationType: PayrollCompensationType;
  rateCents: number;
  currency: string;
  payFrequencyName: string;
  jobTitle: string;
  description: string;
  effectiveFrom: string;
  note: string | null;
  confirmedAt: string | null;
  hasContractPdf: boolean;
}

export interface CompensationStatusEntry {
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  employeeEmail: string;
  // Whether this person has ever confirmed a first-ever contract (linked
  // User) — reassignments never re-trigger confirmation, so this is the
  // right Draft/Confirmed signal, not a field on currentCompensation itself.
  isConfirmed: boolean;
  personType: 'profile' | 'contractor' | 'employee' | null;
  currentCompensation: {
    payFrequencyName: string;
    compensationType: PayrollCompensationType;
    rateCents: number;
    currency: string;
  } | null;
}

// A closed (effectiveTo set) EmployeeCompensation row — the "Terminated"
// bucket of the Assignments tab. Separate from CompensationStatusEntry
// (which only ever looks at the currently-open row) since a person can have
// several of these in their history.
export interface TerminatedCompensationEntry {
  compensationId: string;
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  employeeEmail: string;
  payFrequencyName: string;
  compensationType: PayrollCompensationType;
  rateCents: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string;
}

export interface BulkCompensationEntryResult {
  employeeId: string;
  success: boolean;
  compensationId?: string;
  error?: string;
}

export type PayrollEntryType = 'base' | 'bonus' | 'commission' | 'reimbursement' | 'deduction';
export type PayrollRunStatus = 'draft' | 'confirmed';

export interface PayrollRun {
  id: string;
  tenantId: string;
  payFrequencyId: string | null;
  periodLabel: string;
  status: PayrollRunStatus;
  createdByUserId: string;
  confirmedAt: string | null;
  createdAt: string;
}

export interface PayrollRunEntry {
  id: string;
  type: PayrollEntryType;
  amountCents: number;
  currency: string;
  hoursQty: number | null;
  label: string | null;
  paymentDate: string;
}

export interface RunDetailEmployeeRow {
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  compensationType: PayrollCompensationType;
  rateCents: number;
  currency: string;
  statusName: string;
  isInactive: boolean;
  entries: PayrollRunEntry[];
  baseAmountCents: number;
  adjustmentsTotalCents: number;
  totalCents: number;
}

export interface RunDetail {
  run: PayrollRun & { payFrequency: { id: string; name: string } | null };
  employeeRows: RunDetailEmployeeRow[];
  excludedCount: number;
  hasUnloadedHours: boolean;
}

// A loose (runId: null) off-cycle PayrollEntry, for the unified timeline
// (Unidad 19) — includes the employee's name since the timeline shows it
// without a separate lookup.
export interface OffCyclePayrollEntry extends PayrollRunEntry {
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
}
