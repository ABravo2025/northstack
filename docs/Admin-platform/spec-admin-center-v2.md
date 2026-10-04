# Admin Center v2: spec and status

_Last updated: 2026-10-03_

Alejandro decided on 2026-10-03 to rebuild the Admin Center from zero: the previous one
(`northstack-devtasks`) "doesn't meet the minimum". Approved prototype:
https://claude.ai/artifact/MuqVmwK4WQwqDTwK2hdw4X

## Decisions (2026-10-03)

- **Production only (Alejandro, 2026-10-03; repeated 2026-10-04): there is no test Admin.** Admin
  changes skip the staging review and go straight to `main`. Cherry-pick only the Admin commit; schema changes are pushed to the prod DB first.

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
2. **Stage 2a, LIVE IN PRODUCTION since 2026-10-03.**
   - Actions with a log (`PlatformAuditEntry`, mandatory reason, shown in the client's Activity
     tab and in "Registro de acciones"):
     - extend trial;
     - change plan (trial: plan choice; paying: same path as the customer's self-serve change);
     - suspend (view-only) and reactivate;
     - send a password-reset link.
   - Tickets and Ideas screens (list, detail, status, replies).
   - Not done: Mercado Pago upgrades from the Admin, which need the customer's authorization.

   - **2b, LIVE IN PRODUCTION since 2026-10-04 (reviewed on staging).** Per-client agreements
     in `Tenant.planOverride`, layered on top of the plan in `planLimits.ts`
     (`PlanOverride` / `activeOverride` / `getPlanLimits`):
     - Payroll, Payments and API/AI switched on or off per client;
     - limits changed: pipelines, time-off policies, custom roles, activity-log days, trial user
       cap;
     - mandatory reason and optional expiry; an expired agreement is ignored automatically.

     The customer app reads `planFeatures` from `GET /api/auth/me` (menu, routes, role editor).
     Core modules (People, Time Off, Sales, Tasks) have no gate yet, so they can't be switched
     off.
   - **2c, LIVE IN PRODUCTION since 2026-10-04.**
     - Free months (Dodo only): `subscriptions.update` with `next_billing_date`. Not yet exercised
       against Dodo; check the Dodo dashboard on first use.
     - Card-update reminder email, instead of "retry charge": neither provider allows a forced
       retry.
     - Client data export: a ZIP with one CSV per module, built by `src/lib/zip.ts`.
3. **Billing page. LIVE 2026-10-04.** Charges per month for both providers (collected / failed /
   refunded per currency), MRR, 6-month chart, next charges, failed payments and pending
   cancellations.
4. **Announcements and staff notes. LIVE 2026-10-04.**
   - Announcements written from the Admin: English required, Spanish optional, an audience
     (plans / countries / clients) and a schedule. The customer bell shows only the ones aimed at
     them, in their language.
   - Staff notes and tasks in their own tables (`PlatformNote` / `PlatformTask`).
5. **Support access and account deletion. LIVE 2026-10-04.**
   - **Support access with consent** (`SupportAccessRequest`): staff asks one user (in-app prompt
     plus email, lapses in 24 h) and access starts when that user accepts (30 min / 2 h / 24 h).
     It is read-only unless edits were allowed, and the user can end it any time. Staff enters
     with a one-time code (60 s, in the URL fragment), and the session lives in that browser tab
     only, with a violet bar. Edits are tagged "Northstack support" in the Activity Log.
   - **Account deletion, 10 days either way** (Alejandro, 2026-10-04): the owner can do it from
     Settings -> Company (name + password), or staff from the Admin. Access is blocked at once,
     the owner gets an email, and staff can undo it until the date. Then the daily cron erases
     everything (`tenantPurgeService.ts`, which walks the DB's foreign keys from Tenant). Staff
     users are detached, and the platform audit log survives.
   - **Pending:** the privacy-policy wording is going through Alejandro's legal agent. Don't use
     support access with real clients until it's published.
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
