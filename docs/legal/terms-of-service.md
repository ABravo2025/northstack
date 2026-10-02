<!--
INTERNAL NOTE — DO NOT PUBLISH THIS COMMENT BLOCK.
Drafted by Claude (AI), not a licensed attorney. This is a strong starting draft based on
standard B2B SaaS practice, tailored to Northstack's actual product and current business
structure. It has NOT been reviewed by a lawyer and should be before it is published or
relied upon, especially given the cross-border fact pattern (Argentina-based individual
operator, U.S.-facing customers).

Known gaps / things to confirm before publishing:
1. "Alejandro Bravo" is used below as the operating individual, inferred from this repo's
   git config. Confirm this is the correct legal name to bind.
2. There is currently no incorporated entity. This means these Terms bind Alejandro Bravo
   personally — the liability cap in Section 11 and claims deadline in Section 12 help, but
   they are contract terms, not a liability shield the way an LLC/corporation is. A
   limited-liability entity (Argentine SRL/SAS or otherwise) is worth prioritizing before
   the product handles paid customers or materially sensitive data at scale.
3. [Effective Date] must be filled in before publishing.
4. Section 3.4 (prohibited sensitive data) is a significant scope restriction — it
   contractually blocks customers from uploading SSNs, health data, financial account
   numbers, government IDs, and biometric data via custom fields. Product/support should
   be aware this exists, since nothing today technically prevents a tenant from typing
   that into a free-text custom field.
5. Governing law/venue: Argentina, courts of the City of Buenos Aires (CABA), confirmed
   twice by you (including after seeing that Stripe/HighLevel both use arbitration). No
   arbitration clause included, by your choice.

Changes made in the second review round (comparison against GoHighLevel's ToS/Privacy
Policy, Stripe's Services Agreement/Privacy Policy, and Gusto/BambooHR's DPA terms — chosen
as B2B SaaS and HR-SaaS comparables):
- You asked for a Disney-style "customer waives the right to sue" clause. Declined to add
  it: what Disney actually had was a mandatory arbitration clause (forum-shifting, not a
  right-to-sue waiver), misapplied from a Disney+ signup to an unrelated wrongful-death
  claim; it caused a major PR backlash and Disney reversed course within days. A blanket
  waiver of the right to sue is generally unenforceable for claims like gross negligence or
  non-waivable statutory rights, and is a bigger legal reach than what even caused Disney's
  incident. Proposed and applied the industry-standard, enforceable alternative instead.
- Added Section 3.6 (Northstack owns aggregated/anonymized usage data derived from Customer
  Data) — matches HighLevel's usage-data clause.
- Added Section 12, a 12-month contractual deadline to bring any claim (HighLevel uses an
  aggressive 3 months; 12 months was chosen as more defensible against an unconscionability
  challenge given you're an individual, not an incorporated company).
- Rewrote Section 9.2 to allow immediate suspension without a cure period for
  security/fraud/legal-risk situations, matching Stripe's pattern, while keeping a cure
  period for ordinary breaches.
- Section 9.3 now fixes retention post-termination at 90 days (was open-ended "reasonable
  period"), matching HighLevel.
- You explicitly re-confirmed Argentina/Buenos Aires courts over arbitration even after
  seeing that Stripe and HighLevel both rely on mandatory arbitration as their real
  liability-limiting mechanism — this is a deliberate trade-off, not an oversight, but it's
  worth revisiting if/when Northstack starts signing U.S. customers at real scale, since
  litigating in Argentina against a U.S. business customer (or vice versa) is more
  cumbersome than either arbitration or home-court litigation.

2026-09-13 update — Section 5.4 updated: Northstack replaced Paddle with Dodo Payments as the
processor for internationally billed Tenants. Both operate as merchant of record, so the
substance of this section is unchanged — only the processor's name. Same review caveat as the
rest of this document applies; flag to counsel before publishing.

2026-09-14 update — Dodo Payments went live in production the same day (real card charges, not
sandbox) — raising the urgency of the "pending legal review" caveat above from theoretical to
live. Also surfaced a real conflict, NOT yet resolved, between this document's text and actual
system behavior: Section 5.1 promises "you will not be charged until the trial ends," but
seatService.ts's per-seat billing (5/10 seats included, $4/mo per extra active seat) bills a
tenant's extra-seat overage immediately (`prorated_immediately`) the moment they exceed their
plan's included seat count — including while `Subscription.status` is still `trialing`, since a
card gets attached (and `provider`/`externalSubscriptionId` get set) at trial start, before the
base plan's own first real charge. A Starter tenant who invites a 6th person during their free
trial would be charged for that extra seat immediately, contradicting Section 5.1 as currently
worded. Flagged to Alejandro rather than silently resolved either direction (suppress seat
billing during trial to match the promise, vs. narrow the promise to "your base plan fee only"
and disclose seat overage as a separate, immediately-billed charge) — a product call, not a
wording call.

2026-09-07 update — Section 5 (Fees) rewritten from scratch. It previously described a free
beta with fees "to be introduced in the future"; that's now stale, since real subscription
billing (Paddle for international/USD Tenants, Mercado Pago for Argentina/ARS Tenants) has
been live in production since 2026-08-23, with a 15-day free trial from signup
(`SIGNUP_TRIAL_DAYS` in tenantService.ts) and a new Refund Policy. Compared against Odoo,
BambooHR, and Stripe's own subscription/billing terms for this pass — all three use the same
core structure this section now follows: trial disclosure, recurring-charge authorization,
named payment processors who actually hold the card/bank data, and a cross-reference to a
standalone refund policy rather than restating refund mechanics inline. Flagging two things
that are product/ops follow-ups, not drafting gaps: (1) Section 14 requires notifying Tenant
owners of material Terms changes — introducing real fees is about as material as it gets, so
existing pre-trial-era Tenants should get an email/in-app notice, not just a silent doc
update; (2) this section states plans are billed "on a recurring basis (e.g., monthly)" —
confirmed against PlansModal.tsx's `/month` price suffix and the absence of any annual-billing
code path, but reconfirm before this section is touched again if annual billing ships.

2026-09-07 (later same day) — Alejandro asked for two more things, applied across all three
documents (this one, privacy-policy.md, refund-policy.md): (1) reinforce that the Service is
still in beta, since Section 5's rewrite now reads like mature commercial billing and could
read as contradicting Section 1.1; (2) change "Changes to these Terms" (Section 14) from
"advance notice before it takes effect" to "no prior notice required, notified via email and
an in-app notification instead." Section 5.3 (Price changes) previously promised advance
notice directly — rewrote it to just point at Section 14 instead of duplicating (and
contradicting) that promise. Added one guardrail not explicitly requested: "except where
applicable law requires otherwise" on the no-prior-notice language, matching the "to the
maximum extent permitted by applicable law" pattern already used elsewhere in this document
(Sections 10-12) — some U.S. states have auto-renewal/negative-option statutes that mandate
advance notice specifically for subscription price increases, so a flat "no notice, ever"
promise could be unenforceable exactly where it matters most. This is a savings clause, not a
watered-down version of the ask — in every case where no such law applies (the default), the
behavior is exactly what was asked: change first, notify after, via email + in-app.
On "push notification": checked the actual product (src/routes/notifications.ts,
Notification model in schema.prisma) — it's a polled in-app notification inbox/bell, not
Web Push (no VAPID keys, no service worker, no Notification.requestPermission anywhere in the
codebase). Used "in-app notification" throughout instead of "push notification" so these
documents don't promise a delivery mechanism (OS-level push, works when the tab's closed)
that doesn't exist. Flagged this distinction to Alejandro rather than silently substituting it.

2026-09-07 (still later same day) — added new Section 1.3 clarifying that the Payroll module
is a record-keeping tool, not a payment service: Northstack doesn't disburse anything to a
Tenant's employees, and Payroll is unrelated to Northstack's own Paddle/Mercado Pago billing
of Tenants (Section 5). Requested because "Payroll" as a feature name, sitting right next to
all the new subscription-billing/refund language, invites exactly that confusion.

Flagging a real, pre-existing issue surfaced while checking this, NOT yet fixed: Section 3.4
(Prohibited categories of data) blanket-bans Tenants from submitting "full ... bank account
numbers," but the Payroll module's own contract-confirmation flow
(contractConfirmationService.ts, encryptPaymentAccountData) collects and stores an
employee's payment/bank account details (AES-256-GCM encrypted) specifically so the Tenant
knows where to pay them. That's a live contradiction — Section 3.4 currently prohibits data
the platform's own flagship paid module is designed to collect. Raised to Alejandro rather
than silently patched, since fixing it means either narrowing 3.4 with an explicit
payroll-disbursement-data carve-out (encrypted, purpose-limited) or reconsidering whether
Payroll should collect that data at all — a product/legal call, not a wording call.

2026-09-07 (still later same day) — resolved, at Alejandro's direction. He confirmed the
Payroll payment-account field is collected out of real product necessity (the feature can't
work without it) and isn't a custom field, so the fix is a narrow carve-out, not a rewrite of
3.4's general prohibition. Added an explicit "Exception — Payroll disbursement account
details" paragraph to Section 3.4, scoped specifically to that one native, encrypted,
purpose-built field — the general ban on Tenant-configured custom fields collecting this
category of data is untouched. Worth reconfirming with Alejandro whether "encrypted at rest"
alone is a sufficient security representation to make in a public legal document, versus
also naming access controls/who can decrypt it — flagging as a smaller follow-up, not
blocking this fix.

2026-10-02 — Alejandro asked for an evaluation pass against everything shipped since
2026-09-07 (3+ weeks, a lot: Dodo replacing Paddle, MCP spec, UI refresh, pricing single
source, i18n, etc.), plus two specific additions: MCP, and an upcoming 2FA feature. Checked
current code/specs rather than trusting memory (per [[feedback_fetch_before_diagnosing]]-
style discipline) before writing anything:
- **Dodo vs. Paddle: already fixed in this file on 2026-09-13**, by someone/some session
  other than this one (Section 5.4 already said "Dodo Payments" before I touched anything
  today) — see that dated note above. Not changed further here.
- **Real gap found: the public HTML pages on the `landing` branch (terms.html, privacy.html,
  refund.html) never got that 2026-09-13 fix — they were still live on joinnorthstack.com
  saying "Paddle."** That's a live, user-facing inaccuracy on a production legal page,
  predating today, found during this evaluation. Fixed in the same pass (see landing branch
  commit).
- **MCP: added to Section 8.2 as NOT YET AVAILABLE**, not as a live capability, even though
  Alejandro's request phrased it in the present tense ("hay MCP para conectar AI"). Verified
  against the actual code (docs/general/spec-mcp-server.md's own construction-unit table, and
  grepping for AiConnection/mcpIntegration/OAuthClient — none exist yet): only Unit 0 (Private
  API restricted to Growth) and Unit 1 (Activity Log source attribution, ui/api/ai) are live.
  The actual `/mcp` endpoint, the tool registry, and OAuth (Units 2-4, the part that lets a
  Tenant actually connect an AI) are 100% unbuilt — ~6.5 of the spec's ~8.5 estimated sessions
  remain. Publishing a ToS clause that says a Tenant *can* connect their AI today, when no
  such endpoint exists, would be a real misleading-claim risk, not just an inaccuracy — chose
  "we are building this, not yet available" over the literal ask and flagged the discrepancy
  to Alejandro rather than silently reframing it.
- **2FA: added to Section 2.2, same "not yet available" framing**, consistent with Alejandro's
  own phrasing this time ("aún no está activo, pero lo estará en breves") — zero 2FA code
  exists anywhere in src/ (checked). Deliberately did not commit to a timeframe ("en breves"
  is vague on purpose) — a legal document shouldn't promise a ship date neither of us controls.
- **New Section 8.2 ("Integrations you choose")**: while grounding MCP, found that Google
  Calendar sync and Stripe Payments v1 (Tenant-connects-its-own-Stripe-account invoicing) —
  both real, live, shipped features — had *no* ToS/Privacy Policy coverage at all before today.
  That's a pre-existing gap, not something today's asks created, surfaced only because MCP
  needed the same "Tenant's own choice, Tenant's own third party, not Northstack's problem"
  framing and it made sense to write one section covering all three (two live, one upcoming)
  instead of three near-duplicate ones. Mirrored to privacy-policy.md's new Section 4.5.

2026-10-02 (later same day) — Alejandro corrected the Stripe description in 8.2: it undersold
the integration as passive "connect your account," when Payments v1 Unit 8 (shipped
2026-09-30/10-01, stripeInvoiceService.ts) actually lets the Service **write** to the
Tenant's Stripe account — create an invoice, add line items, finalize it, and send it,
which makes Stripe itself email the Tenant's own client. That's a real write action with a
real external-communication side effect (an email a Northstack user triggers landing in a
third party's inbox), not just a read/sync integration like the Google Calendar case right
next to it, so it needed its own sentence rather than being folded into the generic
"connect to its own third-party accounts" framing. Verified directly against
stripeInvoiceService.ts (createInvoice/finalizeInvoice/sendInvoice) before writing this,
not from memory. Added the same correction to privacy-policy.md's 4.5, plus a new Processed
Data bullet in its 2.2 for the invoice line-item/amount/memo data this writes to Stripe.

2026-10-02 (still later same day) — Alejandro refined the Stripe write further: the
Service's write access is entirely gated by the permissions on the Tenant's own Stripe API
key (read-only key -> read-only; write-capable key -> invoice create/send too) — matches
`StripeKeyPermissionError`'s `access: 'read' | 'write'` branch in stripeInvoiceService.ts
exactly, a 403 on a restricted key means "this key lacks that permission," not "broken."
Also made explicit that invoice creation/sending is the *only* write action currently
supported — no Payment Intent creation, no direct card charging (confirmed zero
`payment_intent.create`-type calls anywhere in src/; the only existing Payment Intent
reference is a webhook *listener*, `payment_intent.payment_failed`, which is read-side).
Alejandro flagged direct charging as a possible future capability — deliberately did not
add a forward-looking "coming soon" promise about it the way MCP/2FA got one, since he
didn't ask for that framing here, only for the current scope to be stated accurately.

2026-10-02 (still later same day) — Alejandro caught that **Effective Date** had been stuck
at "September 7, 2026" through every substantive edit since then: the 2026-09-13 Dodo swap,
and today's MCP/2FA/Integrations/Stripe-permission additions. That's a real inconsistency,
not a style nitpick — Section 14 of this very document promises to "post the updated Terms
with a new effective date" whenever a real change is made, and that promise wasn't being
kept. Bumped to October 2, 2026 (today) now. Going forward: **every substantive edit to
this file should bump Effective Date**, not just today's catch-up — treat a stale date here
as a bug the same way a stale "Paddle" reference was. This also means Section 14's
email + in-app notification to Tenant owners is now overdue for two rounds of real changes
(9/13 and today), not just the fee-introduction one flagged back on 2026-09-07 — still an
open product/ops action, not something fixed by this doc edit alone.

2026-10-02 (still later same day) — Alejandro decided to drop email from the change-
notification promise in Section 14: it now says "with an in-app notification," not "by
email and by an in-app notification." This also resolves the "email + in-app is overdue"
note two paragraphs up — it's just in-app now, so whatever in-app mechanism exists is what
needs to actually fire, not an email campaign. Mirrored the same removal into
privacy-policy.md's Section 10 and refund-policy.md's Section 7. Deliberately did **not**
touch Section 16's "Notices" clause ("Notices to you will be sent to the email address
associated with your Tenant's owner account") — that's a different, general-purpose
contractual notices mechanism (breach, termination, etc.), not the specific "we changed
this document" promise, and an in-app-only channel is a bad fit for a notice a suspended
Tenant might not be able to log in to see. Left untouched unless Alejandro says otherwise.
-->

# Northstack Terms of Service

**Effective Date:** October 2, 2026

Welcome to Northstack. These Terms of Service ("**Terms**") are a binding agreement between
Alejandro Bravo, an individual operating under the trade name "Northstack" and based in
Buenos Aires, Argentina ("**Northstack**," "**we**," "**us**," or "**our**"), and the
business entity or individual entering into these Terms by registering a Northstack
account ("**Customer**," "**you**," or "**your**").

By creating a Northstack account, accessing, or using the Service (defined below), you
agree to these Terms on behalf of yourself and, if applicable, the business you represent.
If you do not agree, do not use the Service. If you are accepting these Terms on behalf of
a company or other legal entity, you represent that you have the authority to bind that
entity, in which case "Customer" refers to that entity.

---

## 1. The Service

Northstack is a multi-tenant, business-to-business software-as-a-service platform that
lets a company ("**Tenant**") register an independent account and manage human resources
records, client/contact records, and related custom data fields, together with user
accounts, roles, and permissions for that Tenant (the "**Service**").

### 1.1 Public beta status

**The Service is currently under active development and offered as a public beta.** It is
openly available for anyone to sign up and use — this is not a private or invite-only beta
— but it remains a beta: it may contain bugs, may change substantially (including removal
or modification of features) without notice, and is not guaranteed to be available at all
times. We do not offer a service level agreement (SLA) or uptime commitment during this
stage. You should not rely on the Service as the sole system of record for information you
cannot afford to lose, and you are responsible for maintaining your own backups of Customer
Data where practicable.

### 1.2 Eligibility

The Service is intended for business use only, is not directed at consumers, and is not
directed at individuals under 18 years of age. By using the Service you represent that you
are at least 18 years old and are using the Service for business purposes related to a
Tenant, not for personal, household, or consumer purposes.

### 1.3 Payroll is a record-keeping tool, not a payment service

The Service includes a Payroll module that lets a Tenant record and track compensation,
pay runs, pay stubs, and related employee/contractor records. **The Payroll module is a
record-keeping tool only.** Northstack does not process, transmit, hold, or execute any
payment or disbursement to a Tenant's employees or contractors on the Tenant's behalf, and
the Payroll module is unrelated to, and has no effect on, Northstack's own billing of
Tenants for the Service (Section 5). The Tenant remains solely responsible for actually
paying its own employees and contractors, through its own banking, payroll, or other means.

---

## 2. Accounts, Roles, and Responsibilities

### 2.1 Tenant accounts

A Tenant account is created by an individual who becomes the initial "owner" of that
Tenant. The owner (and any user granted the "admin" role) may invite additional users,
assign roles (owner, admin, member), and manage the Tenant's data, users, and settings.
Only one user may hold the "owner" role for a Tenant at a time.

### 2.2 Account security

You are responsible for maintaining the confidentiality of account credentials for all
users under your Tenant, and for all activity that occurs under those accounts. You must
notify us promptly at info@joinnorthstack.com if you become aware of any unauthorized
access to or use of an account.

We are also building two-factor authentication (2FA) as an additional, optional account
security feature. **It is not yet available in the Service.** We will announce it, and
update these Terms if needed, once it is.

### 2.3 Accuracy

You are responsible for the accuracy of information provided during registration and for
keeping it up to date, including the identity and authority of users you invite.

### 2.4 Internal responsibility for user management

You (through your Tenant's owner/admin users) are solely responsible for deciding which
individuals to invite as users, which roles to assign them, and when to revoke access.
Northstack has no visibility into, and no responsibility for, whether a given individual
should have access under your organization's own internal policies.

---

## 3. Customer Data

### 3.1 Definition

"**Customer Data**" means all data, records, and content that a Tenant or its users
submit, upload, or generate within the Service, including employee records, client/contact
records, custom field definitions and values, and any other information entered into the
Service.

### 3.2 Ownership and license

As between the parties, Customer Data remains the property of the applicable Tenant. You
grant Northstack a limited, non-exclusive, worldwide license to host, store, process,
transmit, and display Customer Data solely as necessary to provide, maintain, secure, and
support the Service, and to comply with applicable law.

### 3.3 Your warranties regarding Customer Data

You represent and warrant that:

(a) you have all necessary rights, permissions, and lawful basis to submit Customer Data
to the Service, including any personal data of your employees, contractors, clients, or
other third parties;

(b) your collection, use, and submission of Customer Data to the Service complies with all
applicable laws, including employment, labor, and data protection laws applicable to you
and to the individuals whose data you submit; and

(c) your use of the Service, including any custom fields you configure, does not violate
the rights of any third party.

### 3.4 Prohibited categories of data

**You must not submit, and must not configure custom fields to collect, any of the
following to the Service:** government-issued identification numbers (including Social
Security numbers, national ID numbers, or passport numbers), full payment card or bank
account numbers, health or medical information, biometric data, genetic data, or any other
special category of data that requires heightened protection under applicable law. The
Service is not designed or certified to store these categories of data, **except as
described in the Payroll exception below.** If you submit such data in violation of this
Section, you do so at your own risk and remain fully responsible for that data and any
resulting liability; Northstack disclaims responsibility for the consequences of Customer
Data submitted in violation of this Section.

**Exception — Payroll disbursement account details.** This restriction does not apply to an
employee's or contractor's own payment/bank account details entered through the Service's
built-in Payroll module, for the sole purpose of recording where that person should be paid
(Section 1.3). Northstack encrypts that specific field at rest (AES-256-GCM) and does not
use it for any purpose other than storing and displaying it back to the Tenant. This
exception is narrow: it covers only that native, purpose-built Payroll field, not any other
bank account or payment card number, and does not extend to a Tenant-configured custom
field, even one used for a similar purpose.

### 3.5 Data as processor

For Customer Data that constitutes personal data of your employees, contractors, or
clients, you act as the controller (or equivalent) of that data, and Northstack acts only
as a service provider / processor on your behalf, processing that data solely to provide
the Service and per your instructions as configured through the Service. See our
[Privacy Policy](./privacy-policy.md) for more detail on how we handle data.

### 3.6 Aggregated and anonymized data

Notwithstanding Section 3.2, Northstack may generate and retain data derived from Customer
Data and use of the Service that has been aggregated and/or anonymized such that it no
longer identifies you, your Tenant, or any individual (e.g., usage patterns, product
analytics, or performance metrics). Northstack owns this aggregated/anonymized data and may
use it to operate, secure, and improve the Service, including after termination of your
account, provided it does not identify you or any individual.

---

## 4. Acceptable Use

You will not, and will not permit any user of your Tenant to:

(a) use the Service to violate any applicable law or the rights of any third party;

(b) attempt to access another Tenant's data, accounts, or systems without authorization,
including by circumventing tenant isolation, authentication, or permission controls;

(c) reverse engineer, decompile, or attempt to derive source code from the Service, except
to the extent applicable law expressly permits;

(d) probe, scan, or test the vulnerability of the Service, or interfere with or disrupt its
infrastructure, except through a responsible disclosure process coordinated in advance with
us at info@joinnorthstack.com;

(e) use the Service to transmit malicious code, spam, or unlawful content;

(f) resell, sublicense, or provide the Service to third parties outside your own
organization without our prior written consent; or

(g) use automated means to access the Service (including scraping or bulk data extraction)
other than through interfaces we provide.

We may investigate and take appropriate action, including suspending or terminating
access, for any suspected violation of this Section.

---

## 5. Fees and Billing

**The Service remains in public beta (Section 1.1).** While that's the case, you should expect
fees, plans, and this Section to change more often, and with less advance warning, than a
mature, generally-available product — see Section 14 (Changes to these Terms) for how we
notify you.

### 5.1 Free trial

Every new Tenant receives a free trial of fifteen (15) days from the date of registration.
Our "Free Trial" plan requires no payment method at all. If you select a paid plan
("Starter" or "Growth") during the trial, we may ask you to add a payment method upfront,
but you will not be charged until the trial ends — you can see the exact number of days
remaining in the Service at any time. We encourage you to use the trial period to evaluate
whether the Service is a good fit before adding a payment method or letting a paid
subscription begin.

### 5.2 Subscription charges

If you are on a paid plan when your trial ends, or you select a paid plan directly, you
authorize us and our payment processors (Section 5.4) to charge your designated payment
method on a recurring basis (e.g., monthly) in advance, until your subscription is cancelled
in accordance with Section 5.5. Continuing to use a paid plan after your trial ends, or
adding a payment method to a paid plan, constitutes your authorization for these recurring
charges.

### 5.3 Price changes

We may change our fees from time to time, including for your existing subscription. See
Section 14 (Changes to these Terms) for how and when we notify you of a change.

### 5.4 Payment processors

Payments are processed by third-party payment processors, not Northstack directly: **Dodo
Payments** for Tenants billed internationally in USD, and **Mercado Pago** for Tenants billed in
Argentina in ARS. These processors collect and store your payment card or bank account
details directly, under their own terms of service and privacy policies — Northstack does
not receive or store your full card or bank account number. See our
[Privacy Policy](./privacy-policy.md) for more on how we handle billing-related data.

### 5.5 Cancellation and refunds

You may cancel a paid subscription at any time from the Billing section of the Service, or
by contacting info@joinnorthstack.com. Cancellation stops future billing effective at the
end of your current billing period; it does not, by itself, entitle you to a refund of fees
already charged. **Fees are generally non-refundable — see our
[Refund Policy](./refund-policy.md) for the full policy, including the limited exceptions.**
We encourage you to review the Refund Policy, together with Section 5.1's free trial, before
adding a payment method or upgrading to a paid plan.

---

## 6. Intellectual Property

The Service, including its software, design, "Northstack" name and logo, and all
underlying technology, is owned by Northstack and its licensors and is protected by
intellectual property laws. Except for the limited rights expressly granted to you to use
the Service under these Terms, no rights are granted to you by implication or otherwise.
You will not use Northstack's name, logo, or trademarks without our prior written consent,
except as reasonably necessary to identify that you are a customer of the Service.

---

## 7. Confidentiality

Each party may have access to non-public information of the other party in connection with
the Service ("**Confidential Information**"). Each party will use the other's Confidential
Information only as necessary to perform its obligations under these Terms, and will
protect it using at least the same degree of care it uses for its own confidential
information of similar nature, but no less than reasonable care. Customer Data is
Confidential Information of Customer. This Section does not apply to information that is or
becomes public through no fault of the receiving party, was already known to the receiving
party without confidentiality obligation, or is required to be disclosed by law (in which
case the disclosing party will, where legally permitted, give the other party reasonable
notice).

---

## 8. Third-Party Services

### 8.1 Infrastructure we choose

The Service relies on third-party infrastructure and service providers that we select to
operate it, including cloud hosting and database providers, an email delivery provider, and
our payment processors (Section 5.4). We select these providers with reasonable care, but
we do not control them and are not responsible for their acts, omissions, or outages. Use
of the Service is subject to the availability and performance of these underlying
providers.

### 8.2 Integrations you choose

The Service also offers integrations that a Tenant may choose, at its own option, to
connect to its own third-party accounts — currently Google Calendar (to sync Tasks and Time
Off as calendar events) and Stripe. For Stripe: a Tenant connects its own Stripe account by
providing its own Stripe API key, and **the Service only does what that key's own
permissions allow** — if the Tenant's key is read-only, the Service only reads Stripe data;
if the key grants write access, the Service can also **create and send Stripe-hosted
invoices to that Tenant's own clients on the Tenant's behalf**. Creating and sending an
invoice is currently the only write action the Service performs — it does not create a
Payment Intent or otherwise directly charge or collect a card itself; Stripe's own hosted
invoice page is what actually delivers the invoice and collects payment, not Northstack.
**Connecting an integration, the permissions given to it, and anything the Service does
through it (including sending an invoice), are the Tenant's own choice and the Tenant's own
responsibility.** The third party the Tenant connects, not Northstack, receives and
processes the data exposed through that connection, under that third party's own terms and
privacy practices, and Northstack is not responsible for how it handles that data.

We are also building an integration, using the open Model Context Protocol ("**MCP**"),
that will let a Tenant's own users connect a third-party AI assistant of their choice (such
as Claude, ChatGPT, or similar tools) to that Tenant's own data in the Service. **This
feature is not yet available.** Once available: it will act with the connecting user's own
permissions, every action it takes will be recorded in the Activity Log, it will be limited
to the Growth plan, and the Tenant's-own-choice-and-responsibility principle above will
apply to it in the same way.

---

## 9. Suspension and Termination

### 9.1 By you

You may stop using the Service and request deletion of your Tenant account at any time by
contacting info@joinnorthstack.com.

### 9.2 By us

**Immediate suspension.** We may suspend or terminate your access to the Service
immediately and without prior notice if we reasonably believe: (a) your Tenant or any of
its users poses a security risk to the Service or to other Tenants; (b) you have engaged in
fraud, illegal activity, or a violation of Section 3.4 (prohibited data categories) or
Section 4 (acceptable use); (c) your account is subject to legal process or a request from
a law enforcement or government authority; or (d) continued access would expose Northstack
to legal or regulatory liability.

**Other breaches.** For any other material breach of these Terms, we will provide notice
and a reasonable opportunity to cure before suspending or terminating your access, unless
the circumstances described above apply.

**Discontinuation.** We may also discontinue the Service or the public beta program described in
Section 1.1, in which case we will provide reasonable advance notice where practicable.

### 9.3 Effect of termination

Upon termination, your right to access the Service ends. We will retain Customer Data for
up to ninety (90) days following termination to allow you to request an export, after which
we may permanently delete it without further notice or liability to you, unless a longer
retention period is required by applicable law. See the [Privacy Policy](./privacy-policy.md)
for more detail on our data retention practices.

---

## 10. Disclaimers

**THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND,
WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING WITHOUT LIMITATION ANY IMPLIED WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT, TO THE
MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW.** We do not warrant that the Service will be
uninterrupted, error-free, or secure, or that any data loss will not occur. You are solely
responsible for determining whether the Service is suitable for your intended use,
including compliance with laws applicable to your business and your handling of employee
and client data.

---

## 11. Limitation of Liability

**TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:**

(a) NEITHER PARTY WILL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, GOODWILL, OR DATA, ARISING OUT OF OR
RELATED TO THESE TERMS OR THE SERVICE, REGARDLESS OF THE THEORY OF LIABILITY, EVEN IF
ADVISED OF THE POSSIBILITY OF SUCH DAMAGES; AND

(b) NORTHSTACK'S TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THESE TERMS OR THE
SERVICE WILL NOT EXCEED THE GREATER OF (I) THE TOTAL FEES PAID BY YOU TO NORTHSTACK IN THE
TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR (II) ONE HUNDRED U.S.
DOLLARS (USD 100).

These limitations do not apply to: (i) either party's indemnification obligations under
Section 13; (ii) your breach of Section 3.4 (prohibited data categories) or Section 4
(acceptable use); (iii) either party's gross negligence or willful misconduct; or (iv)
liability that cannot be limited under applicable law.

---

## 12. Time Limit to Bring Claims

**To the maximum extent permitted by applicable law, any claim or cause of action arising
out of or related to these Terms or the Service must be commenced within twelve (12) months
after the event giving rise to the claim, or it will be permanently barred**, regardless of
any statute of limitations or other law to the contrary. This Section does not apply where
prohibited by applicable law.

---

## 13. Indemnification

You will defend, indemnify, and hold harmless Northstack (and Alejandro Bravo personally,
as the operating individual) from and against any third-party claims, damages, losses, and
expenses (including reasonable legal fees) arising out of or related to: (a) Customer Data,
including any claim that it violates the rights of a third party or applicable law; (b)
your breach of Section 3 (Customer Data) or Section 4 (Acceptable Use); or (c) your use of
the Service in violation of these Terms.

---

## 14. Changes to these Terms

**The Service remains in public beta (Section 1.1).** While that's the case, you should expect
these Terms, our pricing and plans, and the Service itself to change more often, and with
less advance warning, than a mature, generally-available product.

We may add, remove, or modify any provision of these Terms — including fees, plans, and
features — at any time and **without prior notice, except where applicable law requires
otherwise.** When we make a change, we will post the updated Terms with a new effective
date and notify Tenant owners **with an in-app notification within the Service.** That
notification may arrive at or after the time the change takes effect, not
necessarily before it. Continued use of the Service after a change takes effect constitutes
acceptance of the updated Terms. If you do not agree to an updated Term, you must stop
using the Service and may request account deletion.

---

## 15. Governing Law and Disputes

These Terms are governed by the laws of Argentina, without regard to conflict-of-law
principles. Any dispute arising out of or related to these Terms or the Service will be
subject to the exclusive jurisdiction of the ordinary courts of the City of Buenos Aires
(Ciudad Autónoma de Buenos Aires), Argentina, and each party submits to that jurisdiction
and waives any objection to venue there.

---

## 16. General Provisions

**Entire agreement.** These Terms, together with the Privacy Policy and, if applicable to
you, the Refund Policy, constitute the entire agreement between the parties regarding the
Service and supersede any prior agreements on the subject.

**Severability.** If any provision of these Terms is held unenforceable, the remaining
provisions will remain in full force and effect, and the unenforceable provision will be
modified to the minimum extent necessary to make it enforceable.

**No waiver.** Failure to enforce any provision of these Terms is not a waiver of the right
to enforce it later.

**Assignment.** You may not assign these Terms without our prior written consent. We may
assign these Terms in connection with a merger, acquisition, or sale of substantially all
of our assets, with notice to you.

**Force majeure.** Neither party is liable for delay or failure to perform due to causes
beyond its reasonable control, including natural disasters, internet or infrastructure
outages, or acts of government.

**Independent contractors.** The parties are independent contractors. Nothing in these
Terms creates a partnership, joint venture, agency, or employment relationship.

**Notices.** Notices to Northstack must be sent to info@joinnorthstack.com. Notices to you
will be sent to the email address associated with your Tenant's owner account.

---

## 17. Contact

Questions about these Terms can be sent to **info@joinnorthstack.com**.

Northstack is operated by Alejandro Bravo, based in Buenos Aires, Argentina.
