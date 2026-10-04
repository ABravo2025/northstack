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
-->

# Northstack Privacy Policy

**Effective Date:** October 2, 2026

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
  password (stored as a salted cryptographic hash, never in plain text).
- Profile information you update after registration.
- Content of support or contact communications you send us.
- Billing and subscription information: the plan you select, trial and subscription status,
  and transaction metadata (such as amount, date, and currency) for payments processed
  through Dodo Payments or Mercado Pago (Section 4.1). **We do not directly collect or store your
  full payment card or bank account number** — our payment processors collect and hold that
  information directly.

### 2.2 Processed Data Tenants submit

- Employee and client/contact records entered by a Tenant's users, including names,
  emails, phone numbers, departments, roles, employment/client status, and any custom
  fields a Tenant configures (subject to the prohibited-category restriction in Section 3.4
  of our Terms of Service).
- Payroll and compensation records a Tenant enters for its own employees/contractors —
  pay frequency, pay runs, pay stubs, and payment account details used to tell the Tenant
  where to send that person's pay (stored encrypted). **Northstack does not use this data to
  execute or transmit any payment — the Payroll module is a record-keeping tool only; see
  Section 1.3 of our Terms of Service.**
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

We do not currently use third-party advertising or analytics trackers, and we do not use
cookies for cross-site tracking or advertising purposes.

---

## 3. How We Use Information

We use Account Data and Processed Data to:

- provide, operate, secure, and maintain the Service (including authentication, tenant
  isolation, and permissions);
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
| Neon | Database hosting (PostgreSQL) | All Account Data and Processed Data at rest |
| Zoho Mail | Transactional email delivery (e.g., invitations) | Recipient email address, name, and email content |
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
its own third-party accounts — currently Google Calendar (to sync Tasks and Time Off as
calendar events) and Stripe. For Stripe: a Tenant connects its own Stripe account by
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

We are also building an integration, using the Model Context Protocol ("MCP"), that will
let a Tenant's own users connect a third-party AI assistant of their choice to that
Tenant's own data in the Service. **This feature is not yet available.** We will update
this Policy with more detail — including which categories of data it can access — once it
is.

---

## 5. Data Retention

We retain Account Data for as long as the associated account is active, and for a
reasonable period afterward to allow for account recovery, comply with legal obligations,
resolve disputes, and enforce our agreements. We retain Processed Data for as long as the
Tenant's account is active, and for a reasonable period after a Tenant requests deletion or
termination, after which it is deleted or anonymized, unless a longer retention period is
required by applicable law. Billing and transaction records may be retained longer where
needed to comply with tax, accounting, or financial recordkeeping obligations. You (or your
Tenant's owner/admin) can request earlier deletion by contacting info@joinnorthstack.com.

---

## 6. Your Rights and Choices

### 6.1 If you are a Northstack user (Account Data)

You can access and update most of your own Account Data directly in the Service (Profile
settings). You may also contact us at info@joinnorthstack.com to request access to,
correction of, or deletion of your Account Data, or to close your account, subject to
information we are required to retain by law.

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
application layer. We are also building two-factor authentication (2FA) as an additional,
optional account security feature; **it is not yet available**, and we will announce it
once it is. No method of transmission or storage is 100% secure, and we cannot
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
