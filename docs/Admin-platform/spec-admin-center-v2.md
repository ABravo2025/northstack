# Admin Center v2: spec and status

_Last updated: 2026-10-03_

Alejandro decided on 2026-10-03 to rebuild the Admin Center from zero: the previous one
(`northstack-devtasks`) "doesn't meet the minimum". Approved prototype:
https://claude.ai/artifact/MuqVmwK4WQwqDTwK2hdw4X

## Decisions (2026-10-03)

- **Production only (Alejandro, 2026-10-03):** Admin changes skip the staging review and go straight
  to `main`. Cherry-pick only the Admin commit; schema changes are pushed to the prod DB first.

- **Where it lives: only `admin.joinnorthstack.com`** (never under app.joinnorthstack.com,
  Alejandro 2026-10-03). The code lives in this repo as a separate lazy frontend chunk
  (`frontend/src/admin/`), served by the same Vercel project as the app. `main.tsx` renders
  `AdminApp` only on an `admin.*` host; locally that's `admin.localhost:5173`. The domain moved
  from the old `northstack-devtasks` project to the app's project on 2026-10-03, so the old Admin
  (and its Tickets/Ideas screens) is retired from that day; stage 4 rebuilds Tickets/Ideas.
- **What's kept from the old Admin:**
  - `User.platformRole`;
  - Ticket/Idea data;
  - the `/api/platform/*` routes and tenant notes/tasks.

  `northstack-devtasks` is retired (2026-10-03).
- **Spanish only.** It's an internal tool and only Alejandro uses it for now.
- **Staff roles (Admin / Support / Read only):** later (~stage 10). Until then only Alejandro
  uses it.
- **Login as support:** only after the selected user of the client **accepts** an access request:
  - the request arrives in-app and by email, and expires in 24 h;
  - read-only by default;
  - limited duration, revocable, and logged on both sides.

  The privacy policy must be updated first (stage 5).
- **Per-client modules and limits ("special agreements"):**
  - enable or disable modules and change limits, layered on top of `planLimits.ts`'s
    `getPlanLimits`;
  - mandatory reason, optional expiry, logged;
  - disabling hides the module and blocks its API, and the data is kept;
  - billing doesn't change.

  This is stage 2.
- **Health score:** team access 40% + modules in use 25% + payments up to date 25% +
  user growth 10%. Implemented in `adminClientService.ts`'s `healthScore`.

## Stages

1. **Clients + client page, read only.** LIVE IN PRODUCTION since 2026-10-03 (admin.joinnorthstack.com).
2. Actions with a log:
   - extend trial, change plan, credit, resend emails, reset password, retry charge,
     suspend/reactivate, export;
   - **modules and limits per client**.
3. Home + Billing: business metrics and alerts.
4. Tickets, Ideas, Announcements and Notes rebuilt and linked to the client page.
5. Login as support (with consent) and delete client.
- Later: staff roles.

## Stage 1: what was built

- **Schema (additive):**
  - `User.lastSeenAt`;
  - `UserActivityDay` (one row per user per UTC day).

  Both are written by `authService.ts`'s `recordUserSeen`: at most every 10 minutes per user,
  and it never fails a request. Before 2026-10-03, last activity is filled in from logins
  (Session) and the Activity Log (last 90 days).
- **API** (platform staff only, any `platformRole`):
  - `GET /api/platform/admin/overview`
  - `GET /api/platform/admin/clients`
  - `GET /api/platform/admin/clients/:id`
- **Client status:**
  - "Active" = has a payment method attached;
  - with no payment method: "In trial" (trial date in the future), "Trial expired" (date
    passed) or "No plan" (old account with no trial date);
  - plus "Payment failed", "Cancels at period end", "Suspended" and "Cancelled".
- **MRR:** locked base price + extra users × locked seat price, in each subscription's own
  currency. It's computed from stored data: nothing calls Dodo/Mercado Pago and no price sync
  is triggered.
- **Alerts:**
  - failed payment;
  - trial ending in ≤3 days (no plan chosen);
  - grace period;
  - 7+ days with no activity;
  - cancellation requested.
- **Screens:**
  - Home: tiles, "needs attention", sign-ups per week, paying clients by plan.
  - Clients: search, filters and the shared table.
  - Client page: tiles, plus 7 tabs: Summary, Users, Usage, Billing, Support, Notes & tasks,
    Activity.
- **Tests:** `tests/adminClientService.test.ts`, covering the formula, status, alerts, MRR, and
  401/403 for non-staff.

## Known notes

- Staff notes/tasks per tenant reuse the tenant's `Note`/`Task` tables (from the old Admin).
  Review whether they should move to their own tables in stage 4.
- Module usage only counts changes (the Activity Log), not page views.
