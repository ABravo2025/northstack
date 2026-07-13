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

**Effective Date:** July 13, 2026

This Privacy Policy explains how Northstack ("**Northstack**," "**we**," "**us**," or
"**our**"), operated by Alejandro Bravo, an individual based in Buenos Aires, Argentina,
collects, uses, shares, and protects information in connection with the Northstack service
(the "**Service**"). Capitalized terms not defined here have the meaning given in our
[Terms of Service](./terms-of-service.md).

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

### 2.2 Processed Data Tenants submit

- Employee and client/contact records entered by a Tenant's users, including names,
  emails, phone numbers, departments, roles, employment/client status, and any custom
  fields a Tenant configures (subject to the prohibited-category restriction in Section 3.4
  of our Terms of Service).

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

These providers' infrastructure is located primarily in the United States; see Section 7
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

---

## 5. Data Retention

We retain Account Data for as long as the associated account is active, and for a
reasonable period afterward to allow for account recovery, comply with legal obligations,
resolve disputes, and enforce our agreements. We retain Processed Data for as long as the
Tenant's account is active, and for a reasonable period after a Tenant requests deletion or
termination, after which it is deleted or anonymized, unless a longer retention period is
required by applicable law. You (or your Tenant's owner/admin) can request earlier deletion
by contacting info@joinnorthstack.com.

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
application layer. No method of transmission or storage is 100% secure, and we cannot
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

We may update this Policy from time to time. If we make material changes, we will post the
updated Policy with a new effective date and, where practicable, notify Tenant owners by
email or in-app notice. Your continued use of the Service after changes take effect
constitutes acceptance of the updated Policy.

---

## 11. Contact Us

Questions, requests, or concerns about this Policy or your data can be sent to
**info@joinnorthstack.com**.

Northstack is operated by Alejandro Bravo, based in Buenos Aires, Argentina.
