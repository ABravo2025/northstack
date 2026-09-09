import prisma from '../src/lib/prisma.js';
import type { LegalPolicyType, PlatformAnnouncementType } from '@prisma/client';

// Publishes one PlatformAnnouncement — the mechanism behind the bell's "What's new" section
// and (for policy_change) the ToS §14 email notice. See docs/Skills/Skills-Development.md for
// when this is required as part of a push. Always target an explicit DATABASE_URL, same as any
// other write against staging/production (see reference_database_environments in memory) —
// this script never assumes which environment the ambient one points at.
//
// Usage:
//   DATABASE_URL="..." npx tsx scripts/publish-announcement.ts \
//     --type feature_update --title "..." --summary "..." --body "..."
//   DATABASE_URL="..." npx tsx scripts/publish-announcement.ts \
//     --type policy_change --title "..." --summary "..." --body "..." --policyType terms_of_service

const VALID_TYPES: PlatformAnnouncementType[] = ['feature_update', 'policy_change'];
const VALID_POLICY_TYPES: LegalPolicyType[] = ['terms_of_service', 'privacy_policy', 'refund_policy'];

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`--${key} needs a value`);
    }
    out[key] = value;
    i += 1;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const type = args.type as PlatformAnnouncementType;
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`--type must be one of: ${VALID_TYPES.join(', ')}`);
  }
  if (!args.title || !args.summary || !args.body) {
    throw new Error('--title, --summary, and --body are all required');
  }

  let policyType: LegalPolicyType | undefined;
  if (type === 'policy_change') {
    if (!args.policyType || !VALID_POLICY_TYPES.includes(args.policyType as LegalPolicyType)) {
      throw new Error(`--policyType is required for policy_change, one of: ${VALID_POLICY_TYPES.join(', ')}`);
    }
    policyType = args.policyType as LegalPolicyType;
  }

  const { createAnnouncement } = await import('../src/modules/notifications/platformAnnouncementService.js');
  const announcement = await createAnnouncement({
    type,
    title: args.title,
    summary: args.summary,
    body: args.body,
    policyType,
  });

  console.log(`Published announcement ${announcement.id} (${type}): "${announcement.title}"`);
  if (type === 'policy_change') {
    console.log('Policy-change emails sent to every active tenant user (best-effort, see server logs for any individual failures).');
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
