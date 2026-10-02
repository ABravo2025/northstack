# Northstack — Handoff

Running context of the whole project, kept current so any session (or person) can pick up where the
last one left off. **Update this file whenever a feature ships or something important changes**
(newest entries on top in "Changelog"). Rule set in `README.md`.

_Last updated: 2026-10-02_

---

## What Northstack is
Multi-tenant SaaS for teams of 5–50: People/HR, Time Off, Sales CRM, Payroll **tracking** (never moves
money), Tasks, Dashboards, Activity Log, Custom Roles, Google Calendar sync. Bilingual app (EN/ES).
Plans: Free trial 15 days (no card, up to 5 users) → Starter / Growth. Prices only in
`src/config/pricing.ts` on `main` (currently USD 19 / 39, 5 / 10 users included, USD 4 per extra
user; Argentina in ARS via Mercado Pago, international via Dodo).

## Where things live
| What | Where |
|---|---|
| App (frontend React+Vite+Tailwind, backend Express+Prisma+Postgres/Neon) | branch `main` → app.joinnorthstack.com |
| Staging | branch `staging` → staging.joinnorthstack.com (Vercel SSO-protected) |
| Website / landing (static, EN + `/es/`) | branch `landing` → joinnorthstack.com (no staging, goes live on push) |
| Marketing assets + this handoff | branch `marketing` (orphan, never merged) |
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

## Website (joinnorthstack.com)
Landing v2 live 2026-10-02: animated product preview, "what it replaces", Time Off spotlight,
team-size price calculator (prices fetched from the app), founder quote, FAQ; EN + ES generated from
one template; About / 404 / legal pages restyled; Terms/Privacy/Refund open in a modal everywhere
(app and site). SEO: per-language OG images, JSON-LD (WebSite, Organization, SoftwareApplication,
FAQPage), sitemap, hreflang.

## Known issues / backlog
- Employee detail modal: fields collapse to one letter at ~900 px viewport width.
- Untranslated strings in ES: Notes/Tasks/Activity tabs, "Actions", "+ Add tag", calendar weekday
  names and "Today", "Active" status.
- Logo (fleur) still navy/blue; chart palette intentionally unchanged.
- Approve time-off endpoint slow (~6 s, calendar sync + notifications).
- Notification preferences (opt-in emails) pending; some transactional emails not awaited.

## Marketing rules (short)
Payroll = tracking only · no Payments marketing · no "EN & ES" claim · no Android claim until Play
Store · no hard-coded prices in posts · demo data only (tenant "Acme Latam" on staging).

---

## Changelog (newest first)
- **2026-10-02** — Marketing branch created; launch kit (LinkedIn posts ES/EN, 45 s demo videos 1:1 and
  16:9 ES/EN, generated music, OG images) in `2026-10/semana-01/`.
- **2026-10-02** — Terms/Privacy/Refund as modals everywhere (landing + app); legal pages, About and
  404 restyled to v2.
- **2026-10-02** — Landing v2 live + SEO pass.
- **2026-10-02** — UI refresh, Time Off company rules, Payments period report, social links promoted
  to production (prod DB additive push first). Android CI fixed (dropped broken setup-android step;
  first green APK since 2026-09-14).
