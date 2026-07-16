import prisma from '../../lib/prisma.js';
import type { EntityType, SavedView, SavedViewType, SavedViewVisibility, UserRole } from '@prisma/client';

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
  createdByRole: UserRole;
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

function canManageShared(role: UserRole): boolean {
  return role === 'owner' || role === 'admin';
}

export async function createSavedView(input: CreateSavedViewInput): Promise<SavedViewResult> {
  if (!input.name.trim()) {
    return { success: false, error: 'Name is required' };
  }

  if (input.visibility === 'shared' && !canManageShared(input.createdByRole)) {
    return { success: false, error: 'Only owner/admin can create a shared view' };
  }

  if (input.type === 'kanban' && !input.groupByField) {
    return { success: false, error: 'Kanban views need a group-by field' };
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
      groupByField: input.type === 'kanban' ? input.groupByField : null,
    },
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

function canEditOrDelete(view: SavedView, userId: string, role: UserRole): boolean {
  if (view.visibility === 'personal') {
    return view.createdByUserId === userId;
  }
  // Shared view: only the creator or the tenant owner.
  return view.createdByUserId === userId || role === 'owner';
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
  role: UserRole,
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

  return { success: true, view };
}

export async function deleteSavedView(
  id: string,
  tenantId: string,
  userId: string,
  role: UserRole,
): Promise<{ success: boolean; error?: string }> {
  const existing = await prisma.savedView.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    return { success: false, error: 'View not found' };
  }

  if (!canEditOrDelete(existing, userId, role)) {
    return { success: false, error: 'Only the creator or the tenant owner can delete this view' };
  }

  await prisma.savedView.delete({ where: { id } });
  return { success: true };
}
