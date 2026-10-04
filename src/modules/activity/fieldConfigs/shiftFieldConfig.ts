import prisma from '../../../lib/prisma.js';
import type { ActivityFieldConfigMap } from '../activityLogService.js';

async function resolveLocationName(id: unknown): Promise<string | null> {
  if (typeof id !== 'string' || !id) return null;
  const location = await prisma.location.findUnique({ where: { id }, select: { name: true } });
  return location?.name ?? null;
}

// Shift snapshots (shiftService.ts's shiftSnapshot) store times already formatted ("07:00") and
// the assignee list as a sorted, comma-separated string of names, so a diff reads naturally.
export const shiftActivityFieldConfig: ActivityFieldConfigMap = {
  locationId: { label: 'Location', resolve: resolveLocationName },
  date: { label: 'Date' },
  start: { label: 'Start' },
  end: { label: 'End' },
  position: { label: 'Position' },
  notes: { label: 'Notes' },
  headcount: { label: 'People needed' },
  status: { label: 'Status' },
  assignees: { label: 'Assigned' },
};

export const shiftTemplateActivityFieldConfig: ActivityFieldConfigMap = {
  name: { label: 'Name' },
  start: { label: 'Start' },
  end: { label: 'End' },
  locationId: { label: 'Location', resolve: resolveLocationName },
  position: { label: 'Position' },
};
