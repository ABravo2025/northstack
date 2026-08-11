import prisma from '../src/lib/prisma.js';
import type { PlatformEntityType } from '@prisma/client';

// One-time seed of PlatformStatusDefinition (Admin Center Block 5) --
// idempotent via upsert on @@unique([entityType, key]), safe to re-run
// (re-running after the `color` field was added backfills it on the
// existing rows too).
const SEED: {
  entityType: PlatformEntityType;
  key: string;
  label: string;
  order: number;
  color: string;
  isDefault?: boolean;
  isTerminal?: boolean;
}[] = [
  { entityType: 'ticket', key: 'open', label: 'Open', order: 0, color: '#3b82f6', isDefault: true },
  { entityType: 'ticket', key: 'in_progress', label: 'In Progress', order: 1, color: '#f59e0b' },
  { entityType: 'ticket', key: 'resolved', label: 'Resolved', order: 2, color: '#22c55e', isTerminal: true },
  { entityType: 'ticket', key: 'closed', label: 'Closed', order: 3, color: '#6b7280', isTerminal: true },
  { entityType: 'idea', key: 'new', label: 'New', order: 0, color: '#3b82f6', isDefault: true },
  { entityType: 'idea', key: 'under_review', label: 'Under Review', order: 1, color: '#f59e0b' },
  { entityType: 'idea', key: 'planned', label: 'Planned', order: 2, color: '#8b5cf6' },
  { entityType: 'idea', key: 'declined', label: 'Declined', order: 3, color: '#ef4444', isTerminal: true },
  { entityType: 'idea', key: 'shipped', label: 'Shipped', order: 4, color: '#22c55e', isTerminal: true },
];

async function main() {
  for (const s of SEED) {
    await prisma.platformStatusDefinition.upsert({
      where: { entityType_key: { entityType: s.entityType, key: s.key } },
      update: {
        label: s.label,
        order: s.order,
        color: s.color,
        isDefault: s.isDefault ?? false,
        isTerminal: s.isTerminal ?? false,
      },
      create: {
        entityType: s.entityType,
        key: s.key,
        label: s.label,
        order: s.order,
        color: s.color,
        isDefault: s.isDefault ?? false,
        isTerminal: s.isTerminal ?? false,
      },
    });
  }

  const count = await prisma.platformStatusDefinition.count();
  console.log(`Seeded ${SEED.length} platform status definitions (${count} total rows now).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
