import prisma from '../../lib/prisma.js';
import { recordActivity } from '../activity/activityLogService.js';
import { savedViewActivityFieldConfig } from '../activity/fieldConfigs/savedViewFieldConfig.js';
import { canManageSharedViews } from '../auth/permissionService.js';
import type { RoleContext } from '../auth/roleService.js';
import type { EntityType, SavedView, SavedViewType, SavedViewVisibility } from '@prisma/client';

export interface ViewFilter {
  field: string;
  operator: string;
  value: string;
}

export interface SortSpec {
  field: string;
  direction: 'asc' | 'desc';
}

export interface CreateSavedViewInput {
  tenantId: string;
  createdByUserId: string;
  createdByRole: RoleContext;
  entityType: EntityType;
  name: string;
  type: SavedViewType;
  visibility: SavedViewVisibility;
  filters?: ViewFilter[];
  sortBy?: SortSpec;
  groupByField?: string | null;
}

export interface SavedViewResult {
  success: boolean;
  view?: SavedView;
  error?: string;
}

export async function createSavedView(input: CreateSavedViewInput): Promise<SavedViewResult> {
  if (!input.name.trim()) {
    return { success: false, error: 'Name is required' };
  }

  // Fase B (Custom Roles) — was an inline `role === 'owner' || role === 'admin'` check, now the
  // named permission manage_shared_views (permissionService.ts).
  if (input.visibility === 'shared' && !canManageSharedViews(input.createdByRole)) {
    return { success: false, error: 'Only owner/admin can create a shared view' };
  }

  if ((input.type === 'kanban' || input.type === 'list') && !input.groupByField) {
    return { success: false, error: `${input.type === 'kanban' ? 'Kanban' : 'List'} views need a group-by field` };
  }

  const view = await prisma.savedView.create({
    data: {
      tenantId: input.tenantId,
      createdByUserId: input.createdByUserId,
      entityType: input.entityType,
      name: input.name.trim(),
      type: input.type,
      visibility: input.visibility,
      filters: input.filters ? JSON.stringify(input.filters) : null,
      sortBy: input.sortBy ? JSON.stringify(input.sortBy) : null,
      groupByField: input.type === 'kanban' || input.type === 'list' ? input.groupByField : null,
    },
  });

  await recordActivity({
    tenantId: input.tenantId,
    entityType: 'savedView',
    entityId: view.id,
    entityLabel: view.name,
    action: 'create',
    changedByUserId: input.createdByUserId,
    after: view,
    fieldConfig: savedViewActivityFieldConfig,
  });

  return { success: true, view };
}

export async function listSavedViews(
  tenantId: string,
  entityType: EntityType,
  userId: string,
): Promise<SavedView[]> {
  return prisma.savedView.findMany({
    where: {
      tenantId,
      entityType,
      OR: [{ visibility: 'shared' }, { createdByUserId: userId }],
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function findSavedViewById(id: string): Promise<SavedView | null> {
  return prisma.savedView.findUnique({ where: { id } });
}

// Deliberately still a raw `role.isOwner` check, not a named permission — this is "the owner
// specifically", not "owner or admin" (unlike canManageSharedViews above), so it stays exactly
// what it was as an inline check, just reading isOwner off the resolved RoleContext instead of
// comparing the legacy UserRole enum string (decision 4 in the Custom Roles plan: relationship/
// ownership rules like this one stay layered on top of the permission system, not replaced by it).
function canEditOrDelete(view: SavedView, userId: string, role: RoleContext): boolean {
  if (view.visibility === 'personal') {
    return view.createdByUserId === userId;
  }
  // Shared view: only the creator or the tenant owner.
  return view.createdByUserId === userId || role.isOwner;
}

export interface UpdateSavedViewInput {
  name?: string;
  filters?: ViewFilter[];
  sortBy?: SortSpec | null;
  groupByField?: string | null;
}

export async function updateSavedView(
  id: string,
  tenantId: string,
  userId: string,
  role: RoleContext,
  input: UpdateSavedViewInput,
): Promise<SavedViewResult> {
  const existing = await prisma.savedView.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    return { success: false, error: 'View not found' };
  }

  if (!canEditOrDelete(existing, userId, role)) {
    return { success: false, error: 'Only the creator or the tenant owner can edit this view' };
  }

  if (input.name !== undefined && !input.name.trim()) {
    return { success: false, error: 'Name is required' };
  }

  const view = await prisma.savedView.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      filters: input.filters !== undefined ? JSON.stringify(input.filters) : undefined,
      sortBy: input.sortBy !== undefined ? (input.sortBy ? JSON.stringify(input.sortBy) : null) : undefined,
      groupByField: input.groupByField !== undefined ? input.groupByField : undefined,
    },
  });

  await recordActivity({
    tenantId,
    entityType: 'savedView',
    entityId: id,
    entityLabel: view.name,
    action: 'update',
    changedByUserId: userId,
    before: existing,
    after: view,
    fieldConfig: savedViewActivityFieldConfig,
  });

  return { success: true, view };
}

export async function deleteSavedView(
  id: string,
  tenantId: string,
  userId: string,
  role: RoleContext,
): Promise<{ success: boolean; error?: string }> {
  const existing = await prisma.savedView.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    return { success: false, error: 'View not found' };
  }

  if (!canEditOrDelete(existing, userId, role)) {
    return { success: false, error: 'Only the creator or the tenant owner can delete this view' };
  }

  await prisma.savedView.delete({ where: { id } });

  await recordActivity({
    tenantId,
    entityType: 'savedView',
    entityId: id,
    entityLabel: existing.name,
    action: 'delete',
    changedByUserId: userId,
    before: existing,
    fieldConfig: savedViewActivityFieldConfig,
  });

  return { success: true };
}
