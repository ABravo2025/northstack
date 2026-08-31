import prisma from '../../lib/prisma.js';
import { bestEffort } from '../../lib/bestEffort.js';
import type { ActivityEntityType, ActivityAction, ActivityLogEntry } from '@prisma/client';

// Human label per entity type, used both in auto-generated summaries ("Created Opportunity
// 'Acme Renewal'") and by the frontend feed's filter dropdown. Kept exhaustive against the full
// enum from day one (spec-activity-log.md's Tier 2-4 values included) even though only Tier 1
// (employee/company/contact/opportunity) has any caller yet — cheaper to write once than to touch
// this map again every time a later unit adds a new entity type.
const ENTITY_TYPE_LABELS: Record<ActivityEntityType, string> = {
  employee: 'Employee',
  company: 'Company',
  contact: 'Contact',
  opportunity: 'Opportunity',
  timeOffPolicy: 'Time Off Policy',
  timeOffRequest: 'Time Off Request',
  employeeCompensation: 'Compensation',
  employeeTermination: 'Termination',
  payrollRun: 'Payroll Run',
  payFrequency: 'Pay Frequency',
  paymentMethod: 'Payment Method',
  statusDefinition: 'Status',
  customFieldDefinition: 'Custom Field',
  fieldCatalogDefinition: 'Field Catalog',
  pipeline: 'Pipeline',
  pipelineStage: 'Pipeline Stage',
  task: 'Task',
  note: 'Note',
  tag: 'Tag',
  savedView: 'Saved View',
  publicForm: 'Public Form',
  tenant: 'Workspace',
  user: 'User',
  invitation: 'Invitation',
  subscription: 'Subscription',
  googleCalendarConnection: 'Google Calendar Connection',
  stripeConnection: 'Stripe Connection',
};

// `record` is the full before/after snapshot the value came from (not just the one field) — a
// resolver formatting Opportunity.amountCents needs its sibling `currency` field, for instance.
export type FieldChangeResolver = (
  value: unknown,
  record: Record<string, unknown>,
) => Promise<string | null> | string | null;

export interface ActivityFieldConfig {
  label: string;
  // Turns a raw value (an FK id, a number, a Date) into display text. Omit for plain
  // strings/booleans, which fall back to defaultFormat below.
  resolve?: FieldChangeResolver;
}

export type ActivityFieldConfigMap = Record<string, ActivityFieldConfig>;

export interface ActivityChange {
  field: string;
  label: string;
  oldValue: string | null;
  newValue: string | null;
}

function defaultFormat(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function hasChanged(a: unknown, b: unknown): boolean {
  const at = a instanceof Date ? a.getTime() : a;
  const bt = b instanceof Date ? b.getTime() : b;
  return at !== bt;
}

// Same mechanism for all 3 actions — create diffs an empty `before` (every initial value shows as
// "set"), delete diffs an empty `after` (every final value shows as "cleared"), update diffs two
// real snapshots. One code path instead of three hand-written message formats per call site.
export async function diffEntity(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  fieldConfig: ActivityFieldConfigMap,
): Promise<ActivityChange[]> {
  const changes: ActivityChange[] = [];
  for (const field of Object.keys(fieldConfig)) {
    const config = fieldConfig[field];
    const beforeRaw = before ? before[field] : null;
    const afterRaw = after ? after[field] : null;
    if (!hasChanged(beforeRaw, afterRaw)) continue;

    const oldValue = config.resolve ? await config.resolve(beforeRaw, before ?? {}) : defaultFormat(beforeRaw);
    const newValue = config.resolve ? await config.resolve(afterRaw, after ?? {}) : defaultFormat(afterRaw);
    if (oldValue === newValue) continue; // resolved to the same display text (e.g. two different null-ish raw values) — not worth logging

    changes.push({ field, label: config.label, oldValue, newValue });
  }
  return changes;
}

function describeChange(change: ActivityChange): string {
  if (change.oldValue === null && change.newValue !== null) {
    return `Set ${change.label}: ${change.newValue}`;
  }
  if (change.oldValue !== null && change.newValue === null) {
    return `Cleared ${change.label} (was ${change.oldValue})`;
  }
  return `Changed ${change.label}: ${change.oldValue} → ${change.newValue}`;
}

export function summarizeChanges(
  changes: ActivityChange[],
  action: ActivityAction,
  entityType: ActivityEntityType,
  entityLabel: string,
): string {
  const typeLabel = ENTITY_TYPE_LABELS[entityType];
  if (action === 'create') return `Created ${typeLabel} "${entityLabel}"`;
  if (action === 'delete') return `Deleted ${typeLabel} "${entityLabel}"`;
  if (changes.length === 0) return `Updated ${typeLabel} "${entityLabel}"`;
  if (changes.length === 1) return describeChange(changes[0]);
  if (changes.length === 2) return `Changed ${changes[0].label} and ${changes[1].label}`;
  return `Changed ${changes[0].label}, ${changes[1].label} and ${changes.length - 2} more`;
}

export interface RecordActivityInput {
  tenantId: string;
  entityType: ActivityEntityType;
  entityId: string;
  // Snapshot of the record's display name at the time — survives a later rename/delete, same
  // reasoning as StatusHistoryEntry.fromStatusName/toStatusName.
  entityLabel: string;
  action: ActivityAction;
  changedByUserId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  fieldConfig: ActivityFieldConfigMap;
  // Set only when this entry's subject is itself attached to another record (Task/Note/Tag,
  // always one of the 4 Tier-1 types) — lets listActivityForEntity surface "a Task/Note/Tag was
  // added to me" on the parent's own tab without misrepresenting entityType/entityLabel as the
  // parent (those stay accurate to what actually changed).
  parentEntityType?: ActivityEntityType;
  parentEntityId?: string;
}

// The single write path every service's create/update/delete calls after its real write commits.
// Wrapped in bestEffort() — a broken activity log entry must never fail or roll back the actual
// operation (src/lib/bestEffort.ts explains why this can't just be a fire-and-forget promise on
// Vercel). Callers await this normally; bestEffort swallows the error internally.
export async function recordActivity(input: RecordActivityInput): Promise<void> {
  await bestEffort(
    recordActivityInternal(input),
    `activityLogService.recordActivity(${input.entityType}/${input.entityId})`,
  );
}

async function recordActivityInternal(input: RecordActivityInput): Promise<void> {
  const changes = await diffEntity(input.before ?? null, input.after ?? null, input.fieldConfig);
  if (input.action === 'update' && changes.length === 0) return; // nothing in the tracked fields actually changed

  const summary = summarizeChanges(changes, input.action, input.entityType, input.entityLabel);

  await prisma.activityLogEntry.create({
    data: {
      tenantId: input.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: input.entityLabel,
      action: input.action,
      summary,
      changes: changes.length > 0 ? JSON.stringify(changes) : null,
      changedByUserId: input.changedByUserId,
      parentEntityType: input.parentEntityType,
      parentEntityId: input.parentEntityId,
    },
  });
}

export type ActivityLogEntryWithUser = ActivityLogEntry & {
  changedBy: { id: string; firstName: string; lastName: string };
};

// Feeds the per-record "Activity" tab (Employee/Company/Contact/Opportunity detail modals).
// Ownership of entityId is validated by the route before calling this, same convention as
// listTasksForEntity/listNotesForEntity — this function trusts its caller. Matches both entries
// directly about this record AND entries about a Task/Note/Tag attached to it (parentEntityType/
// parentEntityId) — a Note added to this Employee shows up here too, not just its own Notes tab.
export async function listActivityForEntity(
  tenantId: string,
  entityType: ActivityEntityType,
  entityId: string,
): Promise<ActivityLogEntryWithUser[]> {
  return prisma.activityLogEntry.findMany({
    where: {
      tenantId,
      OR: [
        { entityType, entityId },
        { parentEntityType: entityType, parentEntityId: entityId },
      ],
    },
    orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
    include: { changedBy: { select: { id: true, firstName: true, lastName: true } } },
  });
}

export interface ListActivityFeedInput {
  tenantId: string;
  entityType?: ActivityEntityType;
  userId?: string;
  action?: ActivityAction;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

export interface ActivityFeedPage {
  items: ActivityLogEntryWithUser[];
  nextCursor: string | null;
}

const DEFAULT_FEED_PAGE_SIZE = 50;

// Feeds the tenant-wide Activity Log page in Settings (canViewActivityLog-gated). Cursor-paginated
// by (changedAt, id) — a plain `changedAt desc` alone isn't a stable sort key across pages (two
// entries can share the same millisecond), same reasoning as the compound orderBy above.
export async function listActivityFeed(input: ListActivityFeedInput): Promise<ActivityFeedPage> {
  const limit = input.limit ?? DEFAULT_FEED_PAGE_SIZE;

  const items = await prisma.activityLogEntry.findMany({
    where: {
      tenantId: input.tenantId,
      ...(input.entityType ? { entityType: input.entityType } : {}),
      ...(input.userId ? { changedByUserId: input.userId } : {}),
      ...(input.action ? { action: input.action } : {}),
      ...(input.from || input.to
        ? { changedAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
        : {}),
    },
    orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: { changedBy: { select: { id: true, firstName: true, lastName: true } } },
  });

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
}
