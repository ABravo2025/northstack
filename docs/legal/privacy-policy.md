<!--
INTERNAL NOTE — DO NOT PUBLISH THIS COMMENT BLOCK.
Drafted by Claude (AI), not a licensed attorney. Same caveats as terms-of-service.md apply:
pending legal review, "Alejandro Bravo" inferred from git config (confirm), [Effective Date]
must be filled in, and this deliberately scopes compliance language to Argentina (as the
operator's home jurisdiction and this policy's governing framework, Ley 25.326) plus a
voluntary, non-statutory extension of CCPA-style rights to U.S. users — it does NOT claim
GDPR compliance or EU representation, per your instruction to leave that for later. If/when
the product actively markets to or signs EU-based tenants, this policy needs a GDPR pass
(legal basis articulation, EU representative, SCCs for transfers, etc.) before that happens,
not after.

2026-09-13 update — Section 4.1's subprocessor table now lists Dodo Payments instead of Paddle
(replaced as the international payment processor). Same merchant-of-record role, so the
data-flow description is unchanged — only the name. Pending legal review same as the rest of
this document.

2026-09-14 update — Dodo Payments went live in production the same day (real cardholder data
now actually flows to them, not just sandbox test data) — raising the urgency of the "pending
legal review" caveat above from theoretical to live. See terms-of-service.md's matching
2026-09-14 note for an unresolved trial/seat-billing conflict this also surfaced (not a Privacy
Policy issue itself, since it's about charge timing, not data handling — flagged there).

2026-09-07 update — added Paddle and Mercado Pago as subprocessors (Section 4.1) and billing
data to Sections 2 and 3, since real subscription billing went live 2026-08-23 (see
terms-of-service.md's matching 2026-09-07 note on its Section 5 rewrite). Northstack does not
receive or store full payment card/bank account numbers — Paddle and Mercado Pago collect
those directly — so this is scoped as billing metadata (plan, trial/subscription status,
transaction amount/date/currency), not payment instrument data, consistent with the
"we do not store full card numbers" language already used for Stripe Payments (Section 3.5
gap note doesn't apply here — that's a Tenant-facing product feature, not something
Northstack itself uses to bill Tenants, so it isn't a Northstack subprocessor for this
Policy's purposes).

2026-09-07 (later same day) — added a beta-status callout and rewrote Section 10 (Changes to
this Policy) from "advance notice before material changes" to "no prior notice required,
notified via email and an in-app notification instead," with an "except where applicable law
requires otherwise" guardrail. Same reasoning and same-day companion change as
terms-of-service.md's matching update to its Section 14 — see that file's internal note for
the full explanation (including why this uses "in-app notification" rather than "push
notification": the product has a polled in-app notification inbox, not Web Push).

2026-09-07 (still later same day) — added Payroll/compensation records to Section 2.2, with
the same "record-keeping only, we don't execute payments" framing added to
terms-of-service.md's new Section 1.3. See that file's internal note for a real,
pre-existing conflict this surfaced: Section 3.4 of the Terms bans Tenants from submitting
full bank account numbers, but Payroll's contract-confirmation flow collects an encrypted
one on purpose. **Resolved same day** — see terms-of-service.md's Section 3.4, which now
carries an explicit, narrow exception for that one native Payroll field.

2026-10-02 — same evaluation pass as terms-of-service.md's matching dated note (read that one
for the full reasoning). Summary as it applies to this file: added new Section 4.5
("Integrations you choose to connect") covering Google Calendar and Stripe Payments v1 (live,
previously undocumented here) and MCP (NOT yet available — verified against
spec-mcp-server.md and the actual code, only the foundational Units 0-1 exist, no `/mcp`
endpoint or AiConnection model yet); added a 2FA "not yet available" sentence to Section 8.
Dodo-vs-Paddle was already fixed here on 2026-09-13 by an earlier session — not touched
again. Real gap found and fixed in the same pass: the public privacy.html on the `landing`
branch still said "Paddle" in its subprocessor table; this .md source did not.

2026-10-02 (later same day) — same Stripe correction as terms-of-service.md's matching
dated note (read that one for the full reasoning): Payments v1 Unit 8 lets the Service
write to and send from a Tenant's own Stripe account (create/finalize/send an invoice,
which makes Stripe email the Tenant's client), not just read it. Rewrote the Stripe
sentence in 4.5 and added a new Processed Data bullet to 2.2 for the invoice line-item/
amount/memo data that flows to Stripe when a Tenant does this.

2026-10-02 (still later same day) — same Stripe-permission refinement as
terms-of-service.md's matching dated note (read that one for the full reasoning): write
access is gated entirely by the Tenant's own Stripe API key permissions, and invoice
create/send is currently the only write action — no Payment Intent/direct charging.

2026-10-02 (still later same day) — same Effective Date fix as terms-of-service.md's
matching dated note: it was stuck at "September 7, 2026" through the 2026-09-13 Dodo swap
and today's edits, contradicting Section 10's own promise to post a new effective date on
every real change. Bumped to October 2, 2026. Going forward, every substantive edit to
this file should bump it too.

2026-10-02 (still later same day) — Alejandro decided to drop email from the change-
notification promise: Section 10 now says "with an in-app notification," not "by email
and by an in-app notification." Same change mirrored to terms-of-service.md's Section 14
and refund-policy.md's Section 7 — see the former's dated note for the full reasoning,
including why Section 16's separate "Notices" clause (which does use email, for a
different purpose) was deliberately left untouched.

Also flagging: this policy distinguishes two categories of personal data —
(1) "Account Data" about the people who actually use Northstack (Tenant owners/admins/
members) that we collect directly, where Northstack is the controller, and
(2) "Processed Data" about a Tenant's own employees/clients, which the Tenant uploads and
controls, and Northstack merely processes/hosts on the Tenant's behalf.
This mirrors Section 3.5 of the Terms of Service and is the load-bearing distinction that
lets Northstack correctly say "we're not the right party to field a deletion request from
your employee — direct them to their employer" instead of taking on obligations for data it
doesn't actually control the purpose/use of.

2026-10-06 — same evaluation pass as terms-of-service.md's matching dated note (read that one
first for the full reasoning and the code citations). Summary as it applies to this file:
- New Section 4.6 (support access + the internal admin tool) and a new Account Data bullet
  in 2.1 for Referral Program payout details (bank/CBU/tax ID, encrypted, collected directly
  from the platform user who joins, not from a Tenant).
- Rewrote Section 5 (Data Retention): fixed deletion mechanics to match
  tenantDeletionService.ts exactly (10-day fixed window, not "up to 90 days"; self-service
  from Settings → Company, not an email request) and corrected the one factual error in
  Alejandro's own draft — the admin audit log is NOT scrubbed of all Account Data on purge
  (reset_password/payment_reminder actions store a user's email in a free-text JSON field
  that survives).
- Invoice retention is now actually true, not just stated: Alejandro confirmed invoices are
  real fiscal records he's independently obligated to keep, so Invoice.subscriptionId was
  made nullable + ON DELETE SET NULL (schema fix, same session) — this paragraph describes
  the code's real behavior now, not a promise ahead of a fix that hadn't happened yet.
- Rewrote 6.1 to point at self-service deletion instead of "contact us," matching 9.1 of the
  Terms.

2026-10-13 — Shifts/Timesheet (spec-shifts.md, 13 units) is now fully live on main — units
1-6 (schedule, locations, shift notifications incl. Google Calendar sync) had been live since
2026-10-07ish; units 7-13 (skills/certifications, timesheet backend, time-spent-on-tasks
timer, approvals, hours/cost reports, notification prefs) landed on main mid-session today
(commit ec6a9fd). This supersedes terms-of-service.md's 2026-10-06 note calling Timesheet
"confirmed zero code anywhere" — that was true then, not now; see that file's matching note
for the correction. Checked the actual schema (Shift, ShiftAssignment, EmployeeAvailability,
Skill/EmployeeSkill, Timesheet/TimeEntry) and code for anything needing new disclosure:
- No geolocation, biometric, or health data: shift clock-in/scheduling has no GPS, no photo,
  no fingerprint. The task timer (Unit 10) is a self-started/stopped stopwatch the assignee
  runs on their own tasks, not activity/screen monitoring.
- Free-text fields (decline reasons, availability notes, timesheet entry descriptions) can
  incidentally contain sensitive information the same way a Time Off reason or Task
  description already can — already governed by the existing blanket Section 3.4 of the
  Terms ("must not submit... health or medical information..."), which applies to anything
  submitted to the Service, not just configured custom fields. No new carve-out needed.
- Decided NOT to add a new Section 2.2 bullet for shift/timesheet data, on the same reasoning
  terms-of-service.md's note already gives for Projects: this is an ordinary feature module
  (schedules, availability, skills, hours) with no payment/liability angle like Payroll's, and
  giving it its own bullet would be new precedent this doc doesn't otherwise follow for
  Sales/CRM/Tasks/Projects. The existing broad Processed Data / Customer Data definition
  already covers it.
- Real gap found and fixed: Section 4.5 said Google Calendar syncs "Tasks and Time Off" —
  factually incomplete since shift notifications (Unit 4) also create events on the
  assignee's connected Google Calendar (ShiftCalendarSync model). Added Shifts to that list.
  This is a sharing-accuracy fix, not a new-category decision, so it doesn't follow the
  Projects "no new precedent" reasoning above — same standard as the Dodo/Paddle and Stripe
  scope corrections earlier in this file.
Bumped Effective Date to October 13, 2026 for this real, substantive (if narrow) correction.

2026-10-19 — MCP is LIVE in production (Alejandro tested it on staging with a real Claude connection,
then asked to ship it). The "we are also building... not yet available" paragraph is replaced by a
description of the live feature, checked against the code: OAuth-only connection, acts with the
user's CURRENT role (Private API resolves it per request), confirmation for delete/deactivate/time
off/hours decisions, Payroll read-only, Activity Log for every change AND connect/disconnect,
disconnect by the user or whoever has manage_api_access, owner can switch it off per role
(use_ai_assistants). Kept the Tenant's-own-choice-and-responsibility framing from §8.2 and made the
third-party-AI-provider point explicit. Same text published on the landing (EN/ES).
Effective Date bumped to October 19, 2026.

2026-10-25 — Alejandro: "Estoy incorporando Google Analytics a la plataforma... para darlo
por hecho." Checked first, per the Lawyer skill file's instruction to verify before drafting:
zero GA/gtag/GTM code anywhere on main, staging, or landing (git grep across all three came up
empty — the earlier "google-analytics"/"gtag" hits were false positives, package-lock.json
hashes that happen to contain those substrings). So this is not live, same situation MCP and
2FA were in before their own "coming soon" paragraphs were written. Asked Alejandro the two
facts that actually change the text (not guessable from code that doesn't exist yet):
(1) scope — landing only vs. also the authenticated app: he said **also inside the logged-in
app**, which is why this went into 2.3 (Account Data collected automatically) rather than
being scoped as a marketing-site-only footnote; (2) Google Signals/ads: he said **plain
analytics, no Signals, no ads/remarketing** — kept the existing "we do not use advertising
trackers" sentence intact and wrote the new paragraph to explicitly not contradict it.
Followed the MCP/2FA precedent exactly: a "we are building X, not yet in use, will update
once it is" paragraph, not a present-tense claim, and not a new Section 4.1 Subprocessors row
(that table is only live, active subprocessors — GA isn't one yet). Per the Lawyer skill
file's "sin cláusulas GDPR todavía" scoping decision, did not add any cookie-consent-banner
language — that's a deliberate, existing, separate decision, not something this change
should quietly expand. Did NOT draft a customer-facing "What's new" announcement
([[feedback_feature_announcement_drafting]]): that rule fires when a feature actually ships
with a legal change, and this one hasn't shipped — an announcement+forced email now would
tell customers something is live that isn't. Revisit when GA actually goes live, same
lifecycle MCP/2FA went through. Effective Date bumped to October 25, 2026. Mirrored to
landing/privacy.html (EN/ES); no ToS change (automatic-collection data, same as the rest of
2.3, doesn't get its own ToS clause, same reasoning as Shifts/Timesheet's note above).

2026-10-25 (later same day) — Payroll v2's tax IDs (staging aa23989) + a real 2FA
correction, task handed over by what the brief itself calls "the development agent," with
suggested wording for ToS §3.4/§1.3. Verified every factual claim against the code before
using any of it (Lawyer skill file: redactar calibrado contra la industria real, no
templates — but also, standing rule all session: code first, brief second):
- Confirmed in schema.prisma: EmployeeTaxId is its own table (never travels with Employee
  rows), AES-256-GCM via the same encryptPaymentAccountData used for payment account
  details (src/lib/encryption.ts), last4 stored unencrypted for display, Cascade on both
  employeeId and tenantId (survives nothing — not SET NULL like Invoice/PlatformAuditEntry).
  Tenant.taxId (the company's own) is explicitly plain text per its own schema comment —
  kept that distinction precise in 2.1/3.4 rather than letting "encrypts... tax
  identification number" accidentally read as covering both.
- taxIdForPayslip (employeeTaxIdService.ts) + maskTaxId (lib/taxId.ts) confirm exactly:
  full decrypted CUIL for 'ar' layout, `XXX-XX-{last4}` for 'ssn' kind otherwise — same
  renderIssuedPayslip() function serves both the viewed/downloaded PDF and the emailed
  attachment (emailPayslip in routes/payslips.ts), so "the emailed PDF carries the full
  CUIL" is the same fact as "the payslip carries the full CUIL," not a separate claim to
  verify. Added Zoho Mail's Section 4.1 row to say so explicitly, since a full government ID
  transiting an already-disclosed subprocessor deserved a concrete callout, same reasoning
  as Dodo/Mercado Pago's specific "collects and stores X directly" sentences.
- verifyPayslip() (payslipV2Service.ts) confirms the public page's exact field list (company
  legalName-or-name, number, firstName + lastName[0]+'.', periodLabel, paymentDate,
  createdAt) — never amounts, never a tax ID. New §4.7 holds it, not §4.2, since the public
  verify page isn't "within a Tenant" at all (no login), and because itemizing it inside
  4.2's existing, deliberately generic "per the Tenant's own roles" sentence would have
  buried a materially different kind of disclosure (a page anyone with the code/QR can
  reach, unauthenticated) inside a paragraph about internal access control.
- One place the brief's own summary was more permissive than the code: "Only the owner and
  Manage payroll roles can change it" undersells it — PUT .../tax-id's actual guard is
  canManagePayroll() OR (canManageEmployee() AND the field is still empty), i.e. whoever can
  manage a person's record can set it once, but only the owner/Manage payroll can change an
  existing one. Wrote §4.7 to say both halves, not the simplified one.
- Retention: the brief's "issued payslips keep their copy of the data for as long as the
  payslip exists" is true but reads as if a payslip's lifetime were its own independent
  thing. It isn't: Payslip.employee has onDelete: Cascade, so deleting a person's record
  deletes their payslips (tax ID copy included) in the same stroke, not later and not
  separately. Wrote §5's new paragraph to say exactly that, rather than repeat language that
  could be read as promising payslips outlive the record they're about.
- Tenant.taxId is collected both at signup (tenantService.ts's createTenant input) and
  editable after in Settings → Company profile (tenantProfileService.ts) — confirms the
  brief's description exactly, and confirms this is Alejandro's own 2026-10-24 reversal of
  this file's prior "no tax ID anywhere" decision (see
  [[project_company_profile_settings_2026-09-25]], which already recorded the reversal and
  flagged this exact legal update as pending) — not a new tension to raise, just the
  follow-through.
- 2FA: the brief asked only to fix "is not yet available." Checked mfaService.ts's
  mfaRequiredFor first and found the old sentence's other half — "optional account security
  feature" — is now also false: required for the owner, manage_billing, manage_payments,
  and Northstack staff. Rewrote both halves, in both documents (see
  terms-of-service.md's matching note), not just the one Alejandro named.
- Did not touch Section 7 (International Data Transfers): no new subprocessor country,
  Zoho already covers the email channel.
Effective Date bumped to October 25, 2026 (same day as the GA note above — two unrelated
substantive passes, one day). Mirrored to landing/privacy.html and landing/terms.html
(EN/ES). Did not draft a "What's new" announcement here — per
[[feedback_feature_announcement_drafting]] that's the development agent's job once it
promotes the release, per Alejandro's own routing instruction in the brief ("let the
development agent know... it will draft the announcement").

2026-10-25 (still later same day) — Alejandro: "dije que estaba en uso GA," correcting the
"Coming... not yet in use" paragraph above. Checked git log, not just re-running the same
grep: at the time that paragraph was written, GA genuinely had zero code anywhere (verified
across main/staging/landing) — the grep wasn't broken, reality changed concurrently.
`origin/landing`'s tip is now e721e74, pushed by another session AFTER my own GA commit
(fa8c59a) and tax-ID commit (0e9683e): real GTM (GTM-TJHVX9R4) + GA4 (G-DQJ1K0FVJ5) on every
website page behind Google Consent Mode v2, a cookie banner (consent.js, decline clears _ga
cookies), and a new Cookie Policy (landing/cookies.html + es/cookies.html, linked from every
footer, the static-site's own legal-modal.js, and the sitemap) — already live, already
verified against the actual deployed site. That commit rewrote landing/privacy.html's
Section 2.3/2.4 and added a Google row to 4.1, correctly split by surface: website analytics
is live, in-app analytics (the thing I'd actually been asked about originally) still isn't —
confirmed zero gtag/GTM code anywhere in main's frontend/backend. That commit touched
`landing` only, not this file, so this file was now the stale one, not the website. Replaced
this section with that exact wording verbatim (not a paraphrase) so the internal master and
the public page say the same thing word for word, and ported the same Section 4.1 row.
Checked LegalDocumentModal.tsx (the in-app React modal) for a 'cookies' doc type: none, but
that's not a gap — the static landing site has its own separate legal-modal.js, already
wired for /cookies.html, and Cookie Policy's audience (anonymous website visitors) doesn't
overlap with the authenticated app the React modal serves. Did not add Cookie Policy to
terms-of-service.md's "Entire agreement" clause either: that clause lists documents
governing a Tenant's use of the Service (Privacy Policy always, Refund/Referral "if
applicable"); Cookie Policy governs the public marketing website, a different audience,
already cross-referenced from Privacy Policy §2.4 instead — same scoping logic as Section 7
not needing a touch for this. No Effective Date change needed beyond what's already here
(still October 25) — same day, third substantive pass.
-->


# Northstack Privacy Policy

**Effective Date:** October 25, 2026

This Privacy Policy explains how Northstack ("**Northstack**," "**we**," "**us**," or
"**our**"), operated by Alejandro Bravo, an individual based in Buenos Aires, Argentina,
collects, uses, shares, and protects information in connection with the Northstack service
(the "**Service**"). Capitalized terms not defined here have the meaning given in our
[Terms of Service](./terms-of-service.md).

**Public beta status.** The Service is currently under active development and offered as a
public beta (see Section 1.1 of our Terms of Service). Because of that, the Service — and
this Policy — may change more often, and with less advance notice, than a mature,
generally-available product; see Section 10 (Changes to this Policy).

---

## 1. Scope and Two Kinds of Data

Northstack is a business-to-business platform. Because of that, this Policy covers two
distinct kinds of personal data, and our role is different for each:

- **Account Data**: information about the individuals who register and use Northstack
  directly — a Tenant's owner, admins, and members (name, email, phone number, password,
  role, and related account activity). **Northstack is the controller of Account Data** and
  is directly responsible for it under this Policy.

- **Processed Data**: information a Tenant enters into the Service about its own
  employees, contractors, or clients (for example, HR records, client/contact records, and
  custom field values). **The Tenant is the controller of Processed Data; Northstack
  processes it only on the Tenant's behalf** and according to the Tenant's configuration of
  the Service, as further described in Section 3.5 of our Terms of Service.

If you are an employee or client of a company that uses Northstack, and your information
appears as Processed Data in that company's account, **please direct any request about your
data to that company directly** — we are typically not in a position to act on it
unilaterally, since the company controls that data. Section 6 below explains how we handle
such requests if they reach us directly.

---

## 2. Information We Collect

### 2.1 Account Data you provide directly

- Registration information: company name, your name, email address, phone number, and
  password (stored as a salted cryptographic hash, never in plain text), and, for companies
  based in Argentina or the United States, the company's own tax identification number (a
  CUIT or EIN) — optional, as free text, for companies elsewhere. It can be edited
  afterward in Settings → Company profile, and is stored as a plain business identifier,
  not encrypted.
- Profile information you update after registration.
- Content of support or contact communications you send us.
- Billing and subscription information: the plan you select, trial and subscription status,
  and transaction metadata (such as amount, date, and currency) for payments processed
  through Dodo Payments or Mercado Pago (Section 4.1). **We do not directly collect or store your
  full payment card or bank account number** — our payment processors collect and hold that
  information directly.
- If you join our Referral Program: your payout method and the account details it requires
  (for example, an email, bank account, CBU/CVU, or tax ID), stored encrypted and used only
  to pay your referral commissions. See our Referral Program Terms and Conditions.

### 2.2 Processed Data Tenants submit

- Employee and client/contact records entered by a Tenant's users, including names,
  emails, phone numbers, departments, roles, employment/client status, and any custom
  fields a Tenant configures (subject to the prohibited-category restriction in Section 3.4
  of our Terms of Service).
- Payroll and compensation records a Tenant enters for its own employees/contractors —
  pay frequency, pay runs, pay stubs, and payment account details used to tell the Tenant
  where to send that person's pay (stored encrypted). For a person hired as an employee in
  Argentina or the United States, if the company uses Payroll: their own tax identification
  number (a CUIL or Social Security number), stored encrypted in a table separate from their
  other records — screens show only its last 4 digits. An issued payslip is emailed to that
  person as a PDF attachment: on an Argentine payslip, both the payslip and that emailed PDF
  show the person's full tax identification number, the way a local *recibo de sueldo* does;
  on a U.S. payslip, both show only the last 4 digits (for example, XXX-XX-1234). **Northstack
  does not use this data to execute or transmit any payment — the Payroll module is a
  record-keeping tool only; see Section 1.3 of our Terms of Service.**
- Invoice records a Tenant creates for its own clients through the Stripe integration
  (line items, descriptions, amounts, and memos). This data is sent to that Tenant's own
  connected Stripe account so Stripe can deliver and collect the invoice; see Section 4.5.

### 2.3 Information collected automatically

- **Usage and log data**: IP address, browser type, device information, timestamps, and
  actions taken within the Service, collected for security, debugging, and reliability
  purposes.
- **Local storage**: we store a small amount of data in your browser's local storage
  (for example, your dark/light mode preference) to remember settings on that device. This
  data stays on your device and is not transmitted to us as tracking data.

We do not use third-party advertising trackers, and we do not use cookies for cross-site
tracking or advertising purposes. Google Analytics is described in Section 2.4.

### 2.4 Google Analytics

**On our public website (joinnorthstack.com): in use.** We use Google Analytics, loaded
through Google Tag Manager, to understand how visitors find and use the site: which pages
are visited, which site you came from, your approximate location (derived from your IP
address), and your device and browser type.

- **Only with your consent**: analytics cookies are set and Google Analytics runs only if
  you choose *Accept* in the cookie banner. If you choose *Decline*, Google Analytics does
  not run. Google Tag Manager itself is loaded on every page to read your choice, and it
  does not set cookies.
- **Change your choice anytime** from the *Cookie settings* link at the bottom of every
  page of the website. The cookies involved and their duration are listed in our
  [Cookie Policy](https://joinnorthstack.com/cookies.html).
- **No advertising**: we do not enable Google Signals, cross-device tracking, or any
  advertising or remarketing feature, and advertising storage is always disabled.
- **Retention**: Google keeps this analytics data for the retention period set in our
  Google Analytics account (currently 2 months).

**Inside the Northstack application: not yet in use.** We plan to add Google Analytics to
the authenticated application too, to measure usage such as pages visited, sessions and
in-product usage events, with the same commitments: no Google Signals, no cross-device
tracking, and no advertising or remarketing features. Once it is in use, we will update
this section, our Cookie Policy, and Section 4.1, and post a new effective date.

---

## 3. How We Use Information

We use Account Data and Processed Data to:

- provide, operate, secure, and maintain the Service (including authentication, tenant
  isolation, and permissions);
- provide customer support, including temporary account access a user of your Tenant
  authorizes (Section 4.6);
- process subscription payments and manage billing, including free trials, plan changes,
  and cancellations, through our payment processors (Section 4.1);
- send transactional email, such as invitation emails, password-related notices, and
  service announcements;
- diagnose technical issues, monitor for abuse, and improve reliability and security;
- comply with legal obligations and enforce our Terms of Service; and
- communicate with you about your account or, with your consent, about product updates.

We do not use Processed Data for any purpose outside providing the Service to the Tenant
that submitted it, and we do not use Processed Data to train external/third-party machine
learning models.

---

## 4. How We Share Information

**We do not sell personal data.** We share information only as follows:

### 4.1 Subprocessors (infrastructure and service providers)

We use third-party providers to operate the Service, each acting under contractual
obligations consistent with the purpose for which we share data with them:

| Provider | Purpose | Data involved |
|---|---|---|
| Vercel | Application hosting (frontend and backend) | All data transmitted through the Service |
| Google (Google Analytics, Google Tag Manager) | Analytics on our public website, only after the visitor accepts analytics cookies (Section 2.4) | Pages visited, referring site, approximate location derived from IP address, device and browser type, and analytics cookie identifiers |
| Neon | Database hosting (PostgreSQL) | All Account Data and Processed Data at rest |
| Zoho Mail | Transactional email delivery (e.g., invitations) | Recipient email address, name, and email content, including a payslip PDF attachment, which on an Argentine payslip carries the person's full tax identification number |
| Dodo Payments | Payment processing for Tenants billed internationally in USD | Billing contact information, plan/subscription data, and transaction data. Dodo Payments collects and stores full payment card details directly — we do not store your full card number. |
| Mercado Pago | Payment processing for Tenants billed in Argentina in ARS | Billing contact information, plan/subscription data, and transaction data. Mercado Pago collects and stores full payment/bank account details directly — we do not store your full account or card number. |

These providers' infrastructure is located primarily in the United States, except Mercado
Pago, which is based in Argentina and processes ARS transactions accordingly; see Section 7
(International Data Transfers).

### 4.2 Within a Tenant

Account Data and Processed Data within a Tenant are visible to that Tenant's own users
according to the roles and permissions the Tenant configures (owner/admin/member). We are
not responsible for a Tenant's internal decisions about who to grant access to.

### 4.3 Legal and safety

We may disclose information if required by law, regulation, legal process, or governmental
request, or where we believe in good faith that disclosure is necessary to protect the
rights, property, or safety of Northstack, our users, or others.

### 4.4 Business transfers

If Northstack is involved in a merger, acquisition, or sale of assets, information may be
transferred as part of that transaction. We will provide notice before information becomes
subject to a different privacy policy.

### 4.5 Integrations you choose to connect

The Service offers integrations that a Tenant may choose, at its own option, to connect to
its own third-party accounts — currently Google Calendar (to sync Tasks, Time Off, and
Shifts as calendar events) and Stripe. For Stripe: a Tenant connects its own Stripe account by
providing its own Stripe API key, and the Service only does what that key's own
permissions allow — read-only if the Tenant's key is read-only, or, if the key grants write
access, the Service can also create and send Stripe-hosted invoices to that Tenant's own
clients on the Tenant's behalf. Creating and sending an invoice is currently the only write
action the Service performs — it does not create a Payment Intent or otherwise directly
charge or collect a card itself; Stripe's own hosted invoice page is what actually delivers
the invoice and collects payment. When a Tenant connects one of these integrations, the
third party it connects — not Northstack — receives and processes the data exposed through
that connection, under that third party's own privacy practices; see Section 8.2 of our
Terms of Service.

AI assistants (MCP). When a Tenant's user connects a third-party AI assistant through the
Model Context Protocol ("MCP"), the assistant can read — and, when the user asks it to,
change — the data that user can already access in the Service with their current role,
which may include tasks and notes, CRM records (companies, contacts, opportunities),
employee records, time off, shifts and timesheets, and payroll runs (read-only); never
data hidden from that user's role. Data the assistant reads is sent to the assistant's
provider, which processes it under its own privacy practices (see Section 8.2 of our Terms
of Service); Northstack does not control that processing. To run the connection we keep:
the assistant's name, the user who connected it, and when it was connected, last used and
disconnected; its access and refresh tokens, stored only in hashed form (access tokens
expire after one hour, refresh tokens after 30 days); a log of the requests it makes
(method, path, result and IP address); and Activity Log entries for every change it makes
and every connection and disconnection. The user, or whoever manages the Tenant's
integrations, can disconnect an assistant at any time.

### 4.6 Northstack support access to your account (only with your permission)

Northstack staff never sign in to your account, or see it the way you do, unless a user of
your account explicitly accepts a request to do so. When our support team needs to look at
your account to help you:

- We send the request to one specific user of your account, inside the Service and by
  email. It states who is asking, why, whether the access is view-only or also allows
  changes, and for how long. A request nobody answers lapses after 24 hours.
- Access starts only when that user accepts it, lasts at most the period shown (30 minutes,
  2 hours, or 24 hours, counted from acceptance), and that user can end it at any time.
- During the access, our staff see the account with the permissions of the user who
  accepted it, never more. In view-only mode they cannot change anything. If changes were
  allowed, every change they make is recorded in your Activity Log as made by Northstack
  support.
- We keep a record of every request, acceptance, entry, and end of access.

Separately from this, a limited number of authorized Northstack staff can see
administrative information about each Tenant that we need to operate, support, and bill
the Service — such as company details, the users of the account and their roles, plan and
billing status, and how much each module is used — through an internal administration
tool. That tool also lets authorized staff take administrative actions such as extending a
trial, changing a plan, suspending an account, or exporting a copy of a Tenant's data (for
example, to fulfill a request under Section 6). Every administrative action our staff take
on a Tenant is recorded together with its reason.

### 4.7 Payslip visibility and the public verification page

Within a Tenant, an issued payslip — and the tax identification number it may show — is
visible only to the person it was issued to, and to the Tenant's owner and any role with
"Manage payroll" permission. A person's tax identification number can be entered, once, by
anyone who can manage that person's record, but can only be changed afterward by the owner
or a "Manage payroll" role.

Each issued payslip also has a public verification page, reachable only with its own QR
code or verification code. That page confirms the payslip was issued by Northstack and
shows only the company name, the payslip number, the person's first name and last initial,
the pay period, the payment date, and when it was issued — **never an amount or a tax
identification number.**

---

## 5. Data Retention

We retain Account Data for as long as the associated account is active, and for a
reasonable period afterward to allow for account recovery, comply with legal obligations,
resolve disputes, and enforce our agreements. We retain Processed Data for as long as the
Tenant's account is active.

**Deleting a Tenant account.** The owner of a Tenant can delete the company account from
the Service (Settings → Company), and Northstack may also delete an account, for example
at the owner's request or under our Terms of Service. In both cases, nobody can sign in to
the account from that moment, the owner is notified by email, and all Account Data and
Processed Data of that Tenant is permanently deleted ten (10) days later. During those 10
days, the deletion can be reversed by contacting info@joinnorthstack.com; after that, it
cannot be undone.

We keep our own copies of invoices and billing records for longer, as needed to comply
with our own tax and accounting obligations, even after the rest of a Tenant's data is
deleted. Payment records held by our payment processors (Dodo Payments, Mercado Pago) are
kept by them according to their own obligations, independent of ours.

A person's tax identification number is deleted when their own record is deleted, or when
the Tenant account is deleted, whichever happens first. An issued payslip, including the
tax identification number it captured at the time it was issued, is deleted together with
the person's record — it is not kept independently afterward — or with the Tenant account.

If you are a Referral Program Member, deleting or deactivating your account does not delete
your payout method and details or the record of your referral commissions and transfers right
away: we keep them, encrypted, for as long as needed to settle the commissions you had already
earned and to comply with our tax and accounting obligations. See the Referral Program Terms
and Conditions.

Our internal record of administrative actions taken on a Tenant (Section 4.6) continues to
exist after that Tenant's account is deleted, for our own operational and compliance
purposes. It is no longer linked to the deleted Tenant, but it may still contain limited
details a staff member included when taking an action — for example, a user's email
address noted when resetting a password.

You (or your Tenant's owner/admin) can request earlier deletion by contacting
info@joinnorthstack.com.

---

## 6. Your Rights and Choices

### 6.1 If you are a Northstack user (Account Data)

You can access and update most of your own Account Data directly in the Service (Profile
settings). You may also contact us at info@joinnorthstack.com to request access to,
correction of, or deletion of your Account Data. If you are the owner of a Tenant, you can
delete the whole company account yourself from Settings → Company; see Section 5 (Data
Retention).

### 6.2 If your data appears as Processed Data

If you are an employee or client of a Northstack Tenant, that company controls its
Processed Data and is the appropriate party to handle your request in the first instance.
If you contact us directly at info@joinnorthstack.com, we will make reasonable efforts to
identify the relevant Tenant and route your request accordingly, or provide you technical
assistance to act on the Tenant's instructions, consistent with our role as a processor.

### 6.3 U.S. state privacy rights

Some U.S. states give residents specific rights over their personal information (for
example, the right to know what is collected, and the right to request deletion). Whether
these laws formally apply to Northstack depends on factors like revenue and data volume
thresholds that may or may not be met at a given time. **Regardless of strict legal
applicability, we voluntarily extend the following to all Account Data holders:** the right
to request a copy of the Account Data we hold about you, and the right to request its
deletion, by emailing info@joinnorthstack.com. We do not sell personal data and do not
engage in behavioral advertising, so rights related to opting out of sale/sharing are not
applicable to our practices.

---

## 7. International Data Transfers

Northstack is operated from Argentina, and our infrastructure providers (Section 4.1) are
based primarily in the United States. By using the Service, you understand that your
information, and any Processed Data your Tenant submits, will be transferred to and stored
in the United States. We take contractual and technical measures with our providers
intended to protect data in transit and at rest, as described in Section 8.

This Policy is not currently structured to support GDPR-specific transfer mechanisms (such
as Standard Contractual Clauses) or an EU-based representative. If your organization is
based in, or you are located in, the European Economic Area, United Kingdom, or
Switzerland, please contact us at info@joinnorthstack.com before submitting personal data
of individuals located there, so we can discuss whether the Service is currently a good fit
for your compliance needs.

---

## 8. Data Security

We use reasonable technical and organizational measures designed to protect Account Data
and Processed Data, including encryption of data in transit (HTTPS/TLS), salted
cryptographic password hashing (scrypt), and tenant-scoped access controls enforced at the
application layer. Two-step verification (2FA) is available to every user and required for
the account owner, users with billing or payments permissions, and Northstack staff (Section
2.2 of our Terms of Service); the authenticator-app secret is encrypted at rest, and
one-time recovery codes are stored as a one-way hash, the same way as your password, and
shown to you only once, when you generate them. No method of transmission or storage is
100% secure, and we cannot
guarantee absolute security. If we become aware of a security incident affecting your data
that we are required by law to notify you of, we will do so without undue delay.

---

## 9. Children's Privacy

The Service is intended for business use by adults and is not directed at, and should not
be used by, individuals under 18 years of age. We do not knowingly collect personal data
from children. If you believe a child has provided us with personal data, contact us at
info@joinnorthstack.com and we will take appropriate steps to delete it.

---

## 10. Changes to this Policy

We may add, remove, or modify any provision of this Policy at any time and **without prior
notice, except where applicable law requires otherwise.** When we make a change, we will
post the updated Policy with a new effective date and notify Tenant owners **with an
in-app notification within the Service.** That notification may arrive at or after the
time the change takes effect, not necessarily before it. Your continued use of the
Service after a change takes effect constitutes acceptance of the updated Policy.

---

## 11. Contact Us

Questions, requests, or concerns about this Policy or your data can be sent to
**info@joinnorthstack.com**.

Northstack is operated by Alejandro Bravo, based in Buenos Aires, Argentina.
