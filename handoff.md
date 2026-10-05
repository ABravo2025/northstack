# Northstack — Handoff

Running context of the whole project, kept current so any session (or person) can pick up where the
last one left off. **Update this file whenever a feature ships or something important changes**
(newest entries on top in "Changelog"). Rule set in `README.md`.

_Last updated: 2026-10-05_

---

## What Northstack is
Multi-tenant SaaS for teams of 5–50: People/HR, Time Off, Sales CRM, Payroll **tracking** (never moves
money), Tasks, Dashboards, Activity Log, Custom Roles, Google Calendar sync. Bilingual app (EN/ES).
Plans: Free trial 15 days (no card, up to 3 users) → Starter / Growth. Prices only in
`src/config/pricing.ts` on `main`. **Per user per month** (live 2026-10-03), minimum 3 users per team:
Starter launch USD 4 / ARS 6.000 (regular USD 6 / ARS 9.000), Growth launch USD 6 / ARS 9.000 (regular
USD 10 / ARS 15.000). Launch price for teams subscribing until 2026-12-31, locked while subscribed; new
teams get the regular price automatically from 2027-01-01. Existing subscribers keep their old locked
price. Argentina billed in ARS via Mercado Pago, everyone else in USD via Dodo. Add-ons (modules sold
separately, per user or flat) have a ready but empty structure (ADDONS in pricing.ts).

## Where things live
| What | Where |
|---|---|
| App (frontend React+Vite+Tailwind, backend Express+Prisma+Postgres/Neon) | branch `main` → app.joinnorthstack.com |
| Staging | branch `staging` → staging.joinnorthstack.com (Vercel SSO-protected) |
| Website / landing (static, EN + `/es/`) | branch `landing` → joinnorthstack.com (no staging, goes live on push) |
| Marketing assets + this handoff | branch `marketing` (orphan, never merged) |
| SEO tracker (status, plan, keyword map, Search Console) | `seo/README.md` on `marketing` |
| Android app (Capacitor debug APK) | GitHub Action "Build Android APK" on every push to `main` |
| Legal texts | `docs/legal/*.md` on `main` + `terms/privacy/refund.html` on `landing` |

Release flow: code → `staging` → user reviews → `main`. Additive DB changes are pushed to the prod DB
(explicit `DATABASE_URL`) **before** promoting code.

## Product status (production)
- **UI refresh 2026-10** (live 2026-10-02): violet `#5b21e6` + Instrument Sans; every list uses the
  shared table with an "+ Add" row; every form/detail opens as a centered modal; content width capped
  on wide screens; Profile with social links (LinkedIn, X, Instagram, Facebook, website) and autosave.
- **Time Off** (live 2026-10-02): 3 views (My time off / Team / Policies); company rules — holiday
  calendar imported per country (Nager.Date) and editable, work week, business vs calendar days per
  policy, company-wide days off, religious holidays per person (HR-only data), never a negative
  balance, advance up to the yearly total, manual adjustments with a reason, year-end carry-over or
  expiry. No half days (companies use an "Emergency leave" policy).
- **Payments** (Stripe, Growth plan): per-company table + period report (collected / open / refunded /
  failed / subscriptions); Dashboards → Payments. **Not marketed.**
- **Sales**: pipelines with own stages (required names, inline "+ Add stage" row), Kanban, opportunities.
- **Payroll tracking**: pay runs, compensation, pay stubs, contract confirmation by the employee.
- Plan limits enforced (Starter vs Growth); MCP / AI-assistant integration in progress (not announced).
- **Projects** (in **staging** only, awaiting Alejandro's review — not in production, don't market yet): phases, tasks, team with roles and progress, per client or internal; 9 niche templates EN/ES (agencies, accounting firms, consulting, internal) with tasks assigned by role; "Save as template" on Growth; Starter max 5 open projects. Spec: `docs/general/spec-projects.md` on staging.
- **Shifts / Turnos** (in **staging** only, units 1–6 of 14, awaiting Alejandro's review — not in production, don't market yet): locations with their own time zone (Starter 1, Growth unlimited), weekly schedule by location or by person, drafts → publish, assignment rules (overlap blocks; time off, holidays, availability, minimum rest and skills warn), confirm/decline from the app or a one-click email link (with .ics), Google Calendar event for connected users, "My shifts" + availability. Reminders will be once a day (Vercel Hobby). Next: skills catalog, daily reminders cron, then timesheet (hours auto-suggested from shifts, completed tasks and meetings). Spec: `docs/general/spec-shifts.md` on staging.

## Website (joinnorthstack.com)
Landing v2 live 2026-10-02: animated product preview, "what it replaces", Time Off spotlight,
team-size per-user price calculator in ARS for visitors in Argentina (by IP) and USD elsewhere, no switch and launch banner (prices fetched from the app), founder quote, FAQ; EN + ES generated from
one template; About / 404 / legal pages restyled; Terms/Privacy/Refund open in a modal everywhere
(app and site). SEO: per-language OG images, JSON-LD (WebSite, Organization, SoftwareApplication,
FAQPage), sitemap, hreflang. Module page: Time Off (EN/ES) since 2026-10-03.

## SEO (full tracker: `seo/README.md`)
- Search Console: Domain property verified; sitemap submitted 2026-10-02, read OK on 2026-10-03. Only `/` indexed. 3-month stats: 9 impressions, 0 clicks, avg
  position 17.9.
- Plan: one page per module EN/ES (Time Off → CRM → HR records → payroll tracking), directory
  backlinks (Capterra, G2, Product Hunt, ...), then comparison pages + guides.
- **Pass 1 LIVE 2026-10-03** (`landing` ca1f1ef): Time Off pages `/time-off-software` + `/es/software-vacaciones`
  (via vercel.json rewrites), home titles/H1 keyword kicker, internal links, sitemap (9 URLs), Android
  dropped from JSON-LD. Next: CRM, HR records, payroll-tracking pages.
- `www` → apex 308 redirect fixed 2026-10-03 (Vercel domain setting). Open: no site analytics yet.

## Known issues / backlog
- Employee detail modal: fields collapse to one letter at ~900 px viewport width.
- Untranslated strings in ES: Notes/Tasks/Activity tabs, "Actions", "+ Add tag", calendar weekday
  names and "Today", "Active" status.
- Logo (fleur) still navy/blue; chart palette intentionally unchanged.
- Approve time-off endpoint slow (~6 s, calendar sync + notifications).
- Notification preferences (opt-in emails) pending; some transactional emails not awaited.
- In-app notifications from Time Off / Sales are stored in English only (Shifts notifications already use each person's language).

## Marketing rules (short)
Payroll = tracking only · no Payments marketing · no "EN & ES" claim · no Android claim until Play
Store · no hard-coded prices in posts · demo data only (tenant "Acme Latam" on staging).
SEO is part of marketing: every SEO change is logged in `seo/README.md` + a changelog line here.

---

## Changelog (newest first)
- **2026-10-05** — **Shifts module** units 1–6 on **staging** (`5644ca9`), not in production yet. Asked by a chemistry lab but built for every niche (labs, clinics, security, retail, cleaning…). Schedule a week across locations with irregular hours (overnight included), publish, and each person confirms from the app or a one-click email; managers see who confirmed, who didn't answer and what's still uncovered. Marketing angle for later: "stop chasing people on WhatsApp to confirm shifts — they get it in their calendar and answer with one click". Interactive prototype (private): https://claude.ai/artifact/3DGWHCMcZvqDQ2U6jjL9N6
- **2026-10-05** — **Projects module** built (units 1–7) and on **staging** (`eb7ec02`), not in production yet: projects with phases, tasks, team and progress, linked to a Company or internal; start blank or from 9 system templates by niche with a role-based task preview; "Save as template" (Growth); Projects section inside each Company and person; Help Center (Guide + FAQ) updated. Prod checklist in `spec-projects.md` (schema via migrate diff, permissions backfill, template seed). Marketing angle for later: "from a blank board or your niche's template in one click" — accounting firms' monthly close is the strongest example.
- **2026-10-04** — Admin Center v2 stages 3–5 LIVE: Billing page, announcements from the Admin (bilingual, targeted, scheduled), support access only with the customer's consent, and **account deletion in 10 days** — customers can now delete their company account themselves (Settings → Company, owner only); data is erased automatically after 10 days. Privacy policy update pending (legal agent). Nothing to market yet.
- **2026-10-04** — Admin Center v2 stages 2a–2c LIVE on **admin.joinnorthstack.com** (old Admin retired): client actions with a mandatory-reason audit log (extend trial, change plan, suspend/reactivate, password-reset link, free months on Dodo, card-update reminder, ZIP data export), Tickets/Ideas screens, and per-client special agreements (Payroll/Payments/API on or off + limits, optional expiry). Internal only — nothing to market.
- **2026-10-03** — **Admin Center v2, stage 1 LIVE** (internal staff tool, `app.joinnorthstack.com/admin`; moves to admin.joinnorthstack.com at stage 4): Home with MRR/conversion/needs-attention, Clients list with health score, per-client page (users, module usage, billing, tickets, notes, timeline). Internal only — nothing to market. Spec: `docs/Admin-platform/spec-admin-center-v2.md` on main (d8832f1).
- **2026-10-03** — Metric tiles (Overview + every Dashboards page) fixed after a client report: label and value centered, long values (e.g. `$114,900.00`, multi-currency sums) shrink to the tile's width instead of spilling out. Straight to prod as a hotfix (main be7afe6, staging 7e82861).
- **2026-10-03** — Northstack listed on **G2** (profile approved). Directory kit: `2026-10/semana-01/directorios/`.
- **2026-10-03** — Pricing fixes LIVE: landing currency by visitor IP (ARS for Argentina via app `/api/public/geo` = Vercel x-vercel-ip-country, USD elsewhere; no currency switch), prices added to the Time Off module pages (EN/ES), Free Trial capped at 3 users (= minimum team). App main 4d91de4, landing dcb2f58.
- **2026-10-03** — `www.joinnorthstack.com` now 308-redirects to `joinnorthstack.com`.
- **2026-10-03** — **Per-user pricing LIVE** (app `main` 5c8d86e + redeploy 75bf7c0, landing 15d995d): launch offer until 2026-12-31 (Starter USD 4 / Growth USD 6 per user, regular 6 / 10; ARS 6.000 / 9.000, regular 9.000 / 15.000), minimum 3 users, plans modal with struck-through regular price and launch banner, landing USD/ARS switch. Previous deploy on 2026-10-02 failed on Vercel's daily build limit (Hobby plan; Vercel Hobby is non-commercial per its terms — Pro recommended).
- **2026-10-03** — SEO pass 1 LIVE on joinnorthstack.com (Time Off module pages EN/ES + home keyword tweaks).
- **2026-10-03** — SEO pass 1 built (Time Off module pages EN/ES, home titles/H1 keywords, internal
  links, sitemap, clean-URL rewrites, Android dropped from JSON-LD); local commit `ca1f1ef`, not pushed
  (Vercel deploy limit). SEO tracker `seo/README.md` + tooling `tools/seo/` added.
- **2026-10-02** — Google Search Console set up (Domain property), sitemap submitted, indexing requested.
- **2026-10-02** — Internal signup alerts in production: staff email (to `SIGNUP_ALERT_EMAIL`, off if unset) on first verification send and on completed tenant registration. "No department" option in People. API-key scope fix (c35d8c2) is on staging only, not yet in production.
- **2026-10-02** — Marketing branch created; launch kit (LinkedIn posts ES/EN, 45 s demo videos 1:1 and
  16:9 ES/EN, generated music, OG images) in `2026-10/semana-01/`.
- **2026-10-02** — Terms/Privacy/Refund as modals everywhere (landing + app); legal pages, About and
  404 restyled to v2.
- **2026-10-02** — Landing v2 live + SEO pass.
- **2026-10-02** — UI refresh, Time Off company rules, Payments period report, social links promoted
  to production (prod DB additive push first). Android CI fixed (dropped broken setup-android step;
  first green APK since 2026-09-14).
