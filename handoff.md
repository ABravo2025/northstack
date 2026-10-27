# Northstack — Handoff

Running context of the whole project, kept current so any session (or person) can pick up where the
last one left off. **Update this file whenever a feature ships or something important changes**
(newest entries on top in "Changelog"). Rule set in `README.md`.

_Last updated: 2026-10-26_

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
- **Payroll tracking** (**v2 live 2026-10-25**, Growth): its own sidebar (Overview, Pay runs, One-off payments, People, Payslips, My payslips, Settings → Settings > Payroll); "Liquidación" in Spanish (never "corrida"). Step-by-step pay run with per-currency totals and change vs the previous run; **bring approved timesheet hours**; **company-defined overtime and surcharges** (start from Argentina, US or custom). **Numbered payslips** (0001-000001) issued on confirm and emailed, Argentine model (net in words, signatures, CUIT/CUIL) or US pay stub (EIN, SSN last 4), QR verification page without amounts, every payslip marked **"Not valid as a legal document"**. Everyone sees **only their own payslips** (My payslips); only owner + Manage payroll see all. Automatic 5-digit file number (legajo, from 01001). Tax IDs: company CUIT/EIN at signup, each employee's CUIL/SSN when added (required only in AR/US for employees; encrypted, last 4 on screen). Payment methods as a switch grid with defaults by country. Numbers formatted by the company's country (AR 125.000,00 / US 125,000.00). Terms §3.4 + Privacy updated Oct 25.
- Plan limits enforced (Starter vs Growth).
- **AI assistants (MCP)** (live 2026-10-19, Growth): each person connects their own Claude / ChatGPT / Cursor via OAuth; it acts as them with their role. Since 2026-10-20 it reaches almost the whole app (122 tools): tasks with comments/@mentions, notes, CRM, employees incl. contract and custom fields, time off with policies/balances, projects, shifts (incl. publishing), timesheets, client reports, clock-in. Two-step confirmation for anything destructive or that notifies people; it can't invite as Admin or with salary/payment roles; payroll read-only; settings and terminations stay in the app.
- **Referral program** (live 2026-10-06): any app user (not outside affiliates) joins from **Referidos** in the sidebar (above Settings, gift icon): payout method + details first (Wise, Payoneer, PayPal, wire — US routing+account / IBAN / SWIFT — or Argentine bank transfer), then the program terms (legal modal). Gets a random code link `app.joinnorthstack.com/register?ref=XXXX-XXXX`. Referred company gets a 30-day trial; the member earns **10% of its first 3 payments**, payable 30 days after each payment, transferred by hand once ≥ USD 50 / ARS 50.000 (per currency). Staff pay from Admin → Referidos and must attach the receipt; the member sees it in the app. Rules in `REFERRAL` (`src/config/pricing.ts`). Refund voiding is manual (providers don't notify refunds). **Don't announce yet** — terms pending accountant/legal review.
- **Projects** (live 2026-10-07): phases, tasks, team with roles and progress, per client or internal; 9 niche templates EN/ES (agencies, accounting firms, consulting, internal) with tasks assigned by role and a preview; "Save as template" on Growth; Starter max 5 open projects; Projects section inside each Company and person; every task has a chat with @mentions (in-app notification) and Meet calls take an invite email. Marketable.
- **Shifts / Turnos** (**fully live in production**: units 1–6 since 2026-10-12, units 7–13 since 2026-10-13; can be marketed): locations with their own time zone (Starter 1 active, Growth unlimited); schedule as a Google-Calendar-style calendar (Day / Week / Month) or By person; drafts → publish; assignment rules (overlap blocks; time off, holidays, availability, minimum rest, missing/expired skills warn); confirm/decline from the app or a one-click email (.ics); Google Calendar for connected users; My shifts + availability; **skills & certifications with expiry** (Growth); **daily reminders** (tomorrow's shifts, unanswered, expiring skills, unlogged hours); **timesheet** that suggests hours from finished shifts, completed tasks, meetings and Google Calendar (never logged on its own), weekly submit → approve / send back, closed weeks fixed by adjustments or reopened; **Approvals** (direct manager or `approve_timesheets`); "How long did it take?" + timer on tasks; **Reports**: the month by person/company/project — planned, done, upcoming, unconfirmed, logged, approved, billable — CSV, optional cost at Payroll hourly rates (Growth), invoice billable hours via Stripe; **email notification preferences** per person (Settings → Profile; bell unchanged). Help Center guide + FAQ (EN/ES); announcements "New: Shifts" and "New: Timesheet, approvals and hours reports" (EN/ES). **Phase 2 (live since 2026-10-19, main `a8c892b`):** hand-overs, swaps and open shifts with manager approval (reason required; requested changes shown in sky blue); **clock-in** with one printed QR per location or from the app, optional geofence, breaks, auto-close, overtime shifts, Shifts → Today board, corrections with reason, daily attendance summary (Growth); **project hour budgets** with 80/100 % notices (Growth); **client hours report** — PDF, private 30-day link or email with the month's approved hours (Growth); **Suggest week** — proposes who covers draft shifts, never publishes on its own (Growth). Announcement "New in Shifts: swaps, clock-in, client reports and suggested schedules" (EN/ES). Specs: `docs/general/spec-shifts.md`, `docs/general/spec-shifts-fase2.md`. Two-step verification live since 2026-10-20 (`docs/general/spec-2fa.md`).

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
Payroll = tracking only · no Payments marketing · no referral-program promo until its terms are reviewed · no "EN & ES" claim · no Android claim until Play
Store · no hard-coded prices in posts · demo data only (tenant "Acme Latam" on staging).
SEO is part of marketing: every SEO change is logged in `seo/README.md` + a changelog line here.

---

## Changelog (newest first)
- **2026-10-26** — Marketing: 38 s HR product video ES/EN (1:1 + 16:9) in `2026-10/semana-05/video/`, recorded from the real production app against staging (demo tenant Acme Latam): profile, onboarding project, time off request + approval, who's out, shifts + QR + Today board, timesheet approval. New synthesized music (`tools/video/music4.py`, 132 BPM funk-pop). Post 04 (vie 30/10) on the copy page. Payslips deliberately left out of the video (could read as a legal payroll service). Found while recording: the employee profile modal shows "Actions", "Notes", "Tasks", "Activity" in English on a Spanish UI.
- **2026-10-26** — Landing: SEO pass 3 (HR records + payroll tracking pages) and the plans review (comparison by module, Projects/Shifts cards, 3-user trial) LIVE together (landing 9f69930); plans table now also lists clock-in, numbered pay stubs, AI assistants (Growth) and 2FA (all plans). Every module now has its own EN/ES page. App side of the plans review (staging 18ac75e, pricing API `limits`) still pending; landing falls back to static numbers that match planLimits.ts. Gap: suggested schedule is documented as Growth but not plan-gated in code.
- **2026-10-26** — SEO pass 2 LIVE: Shifts/CRM/Projects module pages EN/ES (landing af03098). Pass 3 (HR records + payroll tracking pages) built, awaiting approval. Payroll page is tracking-only and says payslips are not legal documents.
- **2026-10-25** — GTM container v2 published with GA4 G-DQJ1K0FVJ5 (consent: analytics_storage). Website analytics now measuring.
- **2026-10-25** — Website analytics LIVE: GTM-TJHVX9R4 + Consent Mode v2 + cookie banner + new Cookie Policy EN/ES; Privacy 2.4 (website in use, app not yet). GA4 G-DQJ1K0FVJ5 tag not yet published inside GTM. Never claim app analytics until 2.4 is updated.
- **2026-10-25** — **Payroll v2 live in production** (main `9833988`, cherry-picked with the earlier "bring approved hours" and "overtime" units): new navigation, numbered AR/US payslips emailed to each person with QR verification, My payslips for everyone (own only), automatic legajo, CUIT/CUIL (EIN/SSN) on payslips, "not valid as a legal document" on every payslip, payment methods by country, numbers in the company's country format. Prod DB: 6 additive SQL files (the unrelated `Invoice` drift still untouched). Legal pages updated the same day (Terms §3.4 Payroll exception, Privacy). Marketing angle: "every employee gets a numbered payslip by email and only sees their own — tracking, not a legal payslip" (do NOT claim legal validity). Payroll stays Growth-only.
- **2026-10-24** — Website analytics prepared (not live): GTM-TJHVX9R4 + Consent Mode v2 + cookie banner + Privacy Policy 2.4 (EN/ES, effective Oct 24), landing branch `analytics` (local). GA4 tag still to be configured inside GTM.
- **2026-10-23** — WhatsApp statuses: 14 image-only 1080×1920 cards in Spanish and English (added 2026-10-24), one per feature (people, time off, calendar, shifts, clock-in, hours, client report, projects, tasks, CRM, payroll tracking, roles, AI assistant, 2FA) in `2026-10/semana-04/whatsapp/`, tooling `tools/whatsapp/estados.mjs`. Ready for Alejandro to post one at a time.
- **2026-10-20** — SEO pass 2 built, not live: Shifts/CRM/Projects module pages EN/ES + sitemap/About/ES-legal fixes (landing branch `seo-pass-2`, local). Preview https://claude.ai/artifact/KMdMhxBJs1H5NV1Dgke6Br
- **2026-10-20** — **AI assistants reach the whole app** (main `866df7e`): a live assistant couldn't load an employee's contract or create/assign a time-off policy, so the Private API was reviewed against every app route and everything operational was added (58 → 122 MCP tools) by running the app's own routes as the connected person — permissions and plan limits can't drift again. Sensitive actions (publish/cancel shifts, invitations, client emails, balance adjustments) ask the user to confirm; the assistant can't invite as Admin or into salary/payment roles. No DB changes. Marketing angle: "run your HR and CRM by talking to your own AI — it can only do what you can" (Growth upgrade reason). Real-assistant QA by Alejandro pending.
- **2026-10-20** — **Two-step verification live in production** (main `f263ad2`): authenticator-app codes (Google/Microsoft Authenticator, Authy, password managers) + 10 recovery codes, "remember this device" 30 days. Required for account owners, anyone with billing or payments permissions, and Northstack staff (Admin Center); optional for everyone else, on every plan. Lost phone: company admins reset it from Settings → Users; the owner's only Northstack support (Admin, audited). Turns on once `MFA_ENCRYPTION_KEY` is set in Vercel Production. Marketing angle: "bank-level sign-in on every plan, at no extra cost" — trust signal for payroll/payments data.
- **2026-10-19** — **Shifts phase 2 live in production** (main `a8c892b`): swaps/hand-overs/open shifts, QR clock-in + Today board, project hour budgets, client hours reports (PDF/link/email), suggested schedule. Promoted alone by cherry-pick; prod DB got 42 additive statements (the unrelated `Invoice` drift still untouched); Help Center + bilingual announcement. Marketing angles: "your team clocks in with their own phone — no tablet, no app to install" (labs, clinics, retail, security) and "send your client the approved hours in one click" (agencies, consultancies). Clock-in, client reports and suggestions are Growth — a good upgrade reason.
- **2026-10-16** — LinkedIn: first two profile posts (Shifts 14/10, Projects 16/10) got 18 and 6 impressions. Diagnosis in `linkedin/README.md`: small network + illegible GIFs + same post in two languages, not the hashtags. Changes: GIFs now open with a big hook card (`tools/gif/hook-gif.mjs`), Spanish only on Alejandro's profile and English only on the company page, broader LATAM hashtags, and a daily/weekly network-growth routine.
- **2026-10-14** — LinkedIn round 3: all 10 planned posts written (ES/EN) through Nov 4 — added CRM, onboarding checklist, roles & permissions, team calendar and "what Northstack replaces" (`2026-10/semana-05/`, `2026-11/semana-01/`); brand image cards 1080×1350 + the "5 signs" PDF carousel (`tools/cards/cards.mjs`). Copy-and-paste page with every post, visual and first comment: https://claude.ai/artifact/VBRYwMv89TezGmnZqHkzGH (`tools/linkedin-page/build.mjs`). Founder-story series pending Alejandro's notes.
- **2026-10-14** — LinkedIn round 2: posts moved to **neutral Spanish (tú)**; the 16/10 founder post now says the lab only *asked* (not a customer, unnamed); links moved out of the post text into the first comment + comment-a-keyword CTAs; research in `linkedin/research-2026-10.md` (founder profile > company page, carousels/GIFs, 3 hashtags by industry, free analytics options: LinkedIn Insight Tag / Cloudflare / GA4 — Vercel Analytics is paid). Product GIFs ES/EN for Shifts, Projects and Time Off in `2026-10/semana-03/gif/` (tooling `tools/gif/`). Staging demo tenant "Acme Latam" now has logins for all 13 fictitious people, shifts for the weeks of Oct 19 and 26 (Palermo/Belgrano) and three "· 10/2026" monthly-close projects.
- **2026-10-13** — **Shifts units 7–13 live in production** (main `ec6a9fd`): skills, daily reminders, timesheet + approvals, task timer, hours reports with cost and invoicing, email notification preferences. Promoted alone by cherry-pick; prod DB got additive SQL only (30 statements; an unrelated `Invoice` drift was left untouched); `approve_timesheets` backfilled on 14 Admin roles; Help Center + bilingual announcement. Marketing angle: "from shift to timesheet to invoice in one place — hours fill themselves in from what your team already did"; strongest for agencies/consultancies (billable hours by client) and labs/clinics (planned vs. worked).
- **2026-10-13** — **LinkedIn strategy started** (`linkedin/README.md`): 2–3 posts/week, each in ES and EN as separate posts, aimed at startups and SMBs (5–50 people); goal = brand awareness + sign up (15-day trial) or contact directly (DM to Alejandro / info@joinnorthstack.com, 20-min demo). Pillars: everyday pain, product in action, tips, founder/behind the scenes. First 5 posts drafted (not published): `2026-10/semana-03/linkedin/` (Shifts, customer-request founder story) and `2026-10/semana-04/linkedin/` (5 signs, Projects monthly close, Time Off). Gap: no site analytics, so LinkedIn signups can't be attributed yet.
- **2026-10-12** — **Shifts module live in production** (`a621596`), promoted on its own (not the rest of staging). Production DB: additive SQL only (the prod DB already had Projects tables that a `db push` would have dropped); Admin permissions backfilled (13 roles); Android build ran OK. Marketing angle: "stop chasing people on WhatsApp to confirm shifts — they get it in their calendar and answer with one click"; strongest for labs, clinics, security, retail and cleaning teams with several sites.
- **2026-10-07** — **Projects module LIVE in production** (main `f1288ff`, docs `4d78fdb`): everything from staging plus the review fixes (task chat with @mentions, Meet invite email, task columns with created date). Brought to main by cherry-pick only — the rest of staging (Shifts, Referrals, MCP, i18n) was not promoted. Prod DB: additive SQL only via migrate diff, Admin permissions backfill (13 roles), 9 system templates seeded. Marketing angle: "start from a blank board or your niche's template in one click" — accounting firms' monthly close is the strongest example.
- **2026-10-06** — **Referral program LIVE in production** (`main` 7755c8a; prod DB got only the additive referral tables first). Users recommend Northstack and earn 10% of a referred company's first 3 payments; the company gets a 30-day trial. Admin → Referidos to pay with receipt. Marketing angle for later: "your users become your sales team" — but **wait for the terms review** before any post or announcement. Mockup: https://claude.ai/artifact/DcECpgxfXvmPKfsXJMbNoN
- **2026-10-04** — Hotfix LIVE (`main` 7e67075): on the login/register/forgot-password screens the intro text was invisible in light mode (same color as the navy panel) and the Terms/Privacy links were hard to read; both fixed for every theme.
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
