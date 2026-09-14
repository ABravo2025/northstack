import { createExtraSeatAddon } from '../src/lib/dodopayments.js';
import { EXTRA_SEAT_PRICE_CENTS } from '../src/modules/tenant/seatService.js';

// One-time provisioning (2026-09-14, seats pricing) — creates the single "Extra seat" Dodo Addon
// shared by every plan/market (see seatService.ts's own comment on why one addon is enough).
// Not DB-tracked like PlanPrice.dodoProductId (there's no per-plan row to hang it off) — the id
// lives in the DODO_EXTRA_SEAT_ADDON_ID env var instead, same as the other billing secrets/ids in
// .env. Guards against creating a second, orphaned addon on an accidental re-run: if the env var
// is already set, stop and tell the operator to remove it first if they really want a new one.
async function main() {
  if (process.env.DODO_EXTRA_SEAT_ADDON_ID) {
    console.log(`DODO_EXTRA_SEAT_ADDON_ID is already set (${process.env.DODO_EXTRA_SEAT_ADDON_ID}) — remove it from .env first if you really want to create a new addon.`);
    return;
  }

  const addonId = await createExtraSeatAddon(EXTRA_SEAT_PRICE_CENTS);
  console.log(`Created Dodo addon ${addonId}. Add this to .env (and Vercel's env vars for every environment that should bill seats):`);
  console.log(`DODO_EXTRA_SEAT_ADDON_ID="${addonId}"`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
