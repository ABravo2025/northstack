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
-->

# Northstack Terms of Service

**Effective Date:** July 13, 2026

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

### 1.1 Beta status

**The Service is currently offered as a beta / early-access product.** It may contain
bugs, may change substantially (including removal or modification of features) without
notice, and is not guaranteed to be available at all times. We do not offer a service
level agreement (SLA) or uptime commitment during this stage. You should not rely on the
Service as the sole system of record for information you cannot afford to lose, and you
are responsible for maintaining your own backups of Customer Data where practicable.

### 1.2 Eligibility

The Service is intended for business use only, is not directed at consumers, and is not
directed at individuals under 18 years of age. By using the Service you represent that you
are at least 18 years old and are using the Service for business purposes related to a
Tenant, not for personal, household, or consumer purposes.

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
Service is not designed or certified to store these categories of data. If you submit such
data in violation of this Section, you do so at your own risk and remain fully responsible
for that data and any resulting liability; Northstack disclaims responsibility for the
consequences of Customer Data submitted in violation of this Section.

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

## 5. Fees

The Service is currently provided free of charge during the beta period described in
Section 1.1. We may introduce paid subscription plans in the future. If we do, we will
provide advance notice before charging any Tenant that is not already on a paid plan, and
continued use of the Service after a paid plan takes effect for your Tenant will be subject
to the pricing and payment terms disclosed to you at that time, which will supplement these
Terms.

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

The Service relies on third-party infrastructure and service providers to operate,
including cloud hosting and database providers and an email delivery provider. We select
these providers with reasonable care, but we do not control them and are not responsible
for their acts, omissions, or outages. Use of the Service is subject to the availability
and performance of these underlying providers.

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

**Discontinuation.** We may also discontinue the Service or the beta program described in
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

We may update these Terms from time to time. If we make material changes, we will provide
notice by posting the updated Terms with a new effective date and, where practicable,
notifying Tenant owners by email or in-app notice. Continued use of the Service after
changes take effect constitutes acceptance of the updated Terms. If you do not agree to the
updated Terms, you must stop using the Service and may request account deletion.

---

## 15. Governing Law and Disputes

These Terms are governed by the laws of Argentina, without regard to conflict-of-law
principles. Any dispute arising out of or related to these Terms or the Service will be
subject to the exclusive jurisdiction of the ordinary courts of the City of Buenos Aires
(Ciudad Autónoma de Buenos Aires), Argentina, and each party submits to that jurisdiction
and waives any objection to venue there.

---

## 16. General Provisions

**Entire agreement.** These Terms, together with the Privacy Policy, constitute the entire
agreement between the parties regarding the Service and supersede any prior agreements on
the subject.

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
