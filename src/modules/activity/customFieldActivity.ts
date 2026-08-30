import { recordActivity } from './activityLogService.js';
import type { ActivityEntityType } from '@prisma/client';

// A custom field value change is logged as an `update` against the *parent* entity (Employee/
// Company/Contact) it belongs to, not as its own activity entity type — CustomFieldValue rows are
// invisible plumbing to a user, "which field on this record changed" is what they actually care
// about. Builds a synthetic one-field before/after record on the fly so it can go through the same
// diffEntity mechanism as every other field change, instead of a bespoke create/update/delete
// message just for this case.
export async function recordCustomFieldValueActivity(input: {
  tenantId: string;
  entityType: ActivityEntityType;
  entityId: string;
  entityLabel: string;
  fieldDefinitionId: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changedByUserId: string;
}): Promise<void> {
  await recordActivity({
    tenantId: input.tenantId,
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    action: 'update',
    changedByUserId: input.changedByUserId,
    before: { [input.fieldDefinitionId]: input.oldValue },
    after: { [input.fieldDefinitionId]: input.newValue },
    fieldConfig: { [input.fieldDefinitionId]: { label: input.fieldName } },
  });
}
