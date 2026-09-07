<!--
INTERNAL NOTE — DO NOT PUBLISH THIS COMMENT BLOCK.
Drafted by Claude (AI), not a licensed attorney. Same caveats as terms-of-service.md and
privacy-policy.md apply: pending legal review, "Alejandro Bravo" inferred from git config
(confirm), and this deliberately scopes to Argentina as the operator's home jurisdiction —
it does NOT independently analyze Argentine or U.S. consumer-protection "cooling-off"
statutes, which is exactly the kind of thing that needs a real lawyer's sign-off before this
goes live, since Northstack is a B2B service but individual jurisdictions vary on how far
that label actually gets you out of consumer refund mandates.

Why this document exists and what it's built on:
Alejandro's brief was: no refunds, because the Service is self-service, the customer
voluntarily enters their own payment/bank details, and every plan already comes with a
15-day free trial specifically so a Tenant can evaluate the product before ever adding a
payment method or being charged. Compared this against Odoo's, BambooHR's, and Stripe's own
public refund/billing terms as the requested B2B SaaS comparables — all three converge on
the same structure this document follows: a hard "fees are non-refundable" default,
justified by (a) a trial/evaluation period offered up front and (b) the self-service nature
of signup, paired with narrow, named exceptions (billing error, fraud, legal mandate) rather
than a discretionary "case by case" clause. None of the three offer prorated or partial
refunds for early/mid-cycle cancellation — cancellation always just stops future billing.

Facts this draft is grounded in (verified against the actual code, not assumed):
- `SIGNUP_TRIAL_DAYS = 15` (tenantService.ts) — the trial is really 15 days, not a rounder
  marketing number.
- Free Trial plan never asks for a payment method; Starter/Growth may ask for one at signup
  but checkoutService.ts does not charge it until the trial window (or whatever's left of it)
  actually elapses.
- Cancellation (subscriptionSelfServeService.ts's requestCancellation) sets
  cancellationEffectiveAt = the current billing period's end and does not touch anything
  already charged — matches this policy's "cancel stops future billing, does not undo past
  charges" framing exactly, not just in spirit.
- A failed/never-collected payment moves a Tenant trialing -> past_due with a 14-day grace
  period, then -> suspended (planTransitionService.ts, GRACE_PERIOD_DAYS = 14) — described in
  Section 6 below in plain language without overcommitting to internal state-machine names
  that could drift out of sync with the code.
- Payment processors are Paddle (international/USD) and Mercado Pago (Argentina/ARS); neither
  is described as holding refund discretion on Northstack's behalf — refund decisions here
  are Northstack's, chargebacks/disputes are the cardholder's bank or Mercado Pago's process.

Known gaps / things to confirm before publishing:
1. No refund mechanism exists anywhere in the current billing code (checked: no `refund`
   reference in checkoutService.ts, subscriptionSelfServeService.ts, planTransitionService.ts,
   paddle.ts, or mercadopago.ts). That's consistent with a no-refunds default, but it also
   means Section 5's "billing error" exception is a promise with no code path behind it yet —
   if Alejandro ever needs to actually issue one, it goes through Paddle's/Mercado Pago's own
   dashboard manually today. Flagging so support doesn't promise an in-app refund button that
   doesn't exist.
2. This draft does not analyze whether Argentine consumer-protection law (Ley 24.240) or any
   U.S. state law creates a mandatory cooling-off/refund right that overrides a contractual
   no-refund clause for a service sold to a "business" customer that might, in substance, be a
   sole proprietor/consumer in some cases. This is the single biggest legal-review item on
   this document — flagged, not resolved.
3. [Effective Date] set to match the same-day Terms of Service / Privacy Policy update.

2026-09-07 (later same day) — added a beta-status callout to Section 1 and rewrote Section 7
(Changes to this Policy) from "advance notice for material changes" to "no prior notice
required, notified via email and an in-app notification instead," with an "except where
applicable law requires otherwise" guardrail. Same reasoning and same-day companion change as
terms-of-service.md's matching update to its Section 14 — see that file's internal note for
the full explanation.

2026-09-07 (still later same day) — added a Scope note to the intro clarifying this Policy
covers only Northstack's own subscription fees, not a Tenant's payroll/employee-payment
activity — same "Payroll is tracking, not payments" disambiguation added to
terms-of-service.md's new Section 1.3, requested because "Refund Policy" sitting next to a
product that has a "Payroll" module invites exactly that mix-up.
-->

# Northstack Refund Policy

**Effective Date:** September 7, 2026

This Refund Policy explains how refunds work for paid subscriptions to the Northstack
service (the "**Service**"), operated by Alejandro Bravo, an individual based in Buenos
Aires, Argentina ("**Northstack**," "**we**," "**us**," or "**our**"). This Policy
supplements our [Terms of Service](./terms-of-service.md), Section 5 (Fees and Billing).
Capitalized terms not defined here have the meaning given in the Terms of Service.

**Scope.** This Policy covers only the fees Northstack charges a Tenant for the Service
itself. It has nothing to do with a Tenant's own payroll, employee compensation, or any
payment a Tenant makes to its own employees, contractors, or clients — Northstack does not
process or execute those payments at all; see Section 1.3 of our Terms of Service.

---

## 1. Overview

**Northstack does not offer refunds for subscription fees, except as described in Section
5 below.** This is a deliberate policy, not an oversight, for two reasons:

- **The Service is self-service.** You choose your own plan, enter your own payment or bank
  details, and can cancel at any time directly from the Service, without needing our
  intervention. Nothing about starting or continuing a paid subscription depends on action
  we take on your behalf.
- **Every plan includes a real evaluation period before any money changes hands.** Every new
  Tenant gets a free trial of fifteen (15) days from registration (Section 2) specifically
  so you can decide whether the Service is right for you before adding a payment method or
  being charged.

Please read this Policy, together with the free trial terms in Section 2, before adding a
payment method or subscribing to a paid plan.

**Beta status.** The Service is currently offered as a beta / early-access product (see
Section 1.1 of our Terms of Service). Our plans, pricing, and this Policy itself may change
as the product evolves — see Section 7 (Changes to this Policy).

---

## 2. Use Your Free Trial First

Every Tenant receives a free trial of the Service for **fifteen (15) days** from the date of
registration:

- Our **Free Trial** plan requires no payment method at all — you can use it, and decide
  whether to subscribe, without ever entering payment information.
- If you select a paid plan (**Starter** or **Growth**) during the trial, we may ask you to
  add a payment method upfront, but **you will not be charged until the trial period ends.**
  You can see the number of trial days remaining at any time inside the Service.

We designed the trial to be the point at which you evaluate the Service — its features,
fit for your organization, and whether you want to continue — precisely so that a refund
process isn't the mechanism for correcting a decision made before you were ever charged. If
you're unsure whether Northstack is right for you, the trial period, not a post-payment
refund request, is the place to find out.

---

## 3. No Refunds

**Except as described in Section 5, all fees paid to Northstack are final and
non-refundable.** This includes, without limitation:

- fees for a billing period in which you stop using the Service partway through;
- fees paid before you cancel your subscription (Section 4);
- fees for a plan you downgrade from partway through a billing period; and
- fees charged because a payment method you voluntarily added remained on file and was
  charged automatically at the end of your free trial or a subsequent billing period, in
  accordance with Section 5.2 of our Terms of Service.

We do not provide partial refunds or credits for unused time within a billing period.

---

## 4. Cancellation Stops Future Billing — It Does Not Refund Past Charges

You can cancel a paid subscription at any time from the Billing section of the Service, or
by contacting info@joinnorthstack.com. Cancellation:

- takes effect at the **end of your current billing period** — you keep access until then,
  and are not charged again after that date; and
- **does not refund any fees already charged**, including the billing period during which
  you cancel.

If you cancel during your free trial, before ever being charged, you will not be charged at
all — there is nothing to refund in that case, since no payment has been collected.

---

## 5. Exceptions

We make limited exceptions to Section 3, on our own initiative or upon request at
info@joinnorthstack.com:

- **Billing errors.** If you were charged the wrong amount, charged after a subscription was
  properly cancelled, or charged due to a demonstrable error on our part or our payment
  processor's part, we will correct the error, which may include a full or partial refund.
- **Fraudulent charges.** If your payment method was used without your authorization, contact
  us immediately at info@joinnorthstack.com. We will also cooperate with any investigation
  your card issuer, bank, or Mercado Pago conducts.
- **Legal requirements.** Where applicable law gives you a non-waivable right to a refund
  that this Policy cannot lawfully override, we will honor that right to the extent required.

Requesting a chargeback or payment dispute directly with your bank or card issuer, without
first contacting us, may result in suspension of your account while the dispute is resolved,
consistent with Section 9.2 of our Terms of Service. We ask that you contact
info@joinnorthstack.com first so we can address a billing error or dispute directly.

---

## 6. How Billing Works (for context)

Subscriptions are billed on a recurring basis (e.g., monthly), in advance, through **Paddle**
(for Tenants billed internationally in USD) or **Mercado Pago** (for Tenants billed in
Argentina in ARS) — see Section 5.4 of our Terms of Service. If a payment cannot be
successfully collected (for example, an expired or declined card), your account may enter a
grace period during which you retain access while you update your payment method; if payment
is still not collected by the end of that grace period, access to the Service may be
suspended. Entering a grace period or being suspended for non-payment is not a billing
error and does not itself create a refund entitlement — see Section 5 for what does.

---

## 7. Changes to this Policy

We may add, remove, or modify any provision of this Policy at any time and **without prior
notice, except where applicable law requires otherwise**, consistent with Section 14 of our
Terms of Service. When we make a change, we will post the updated Policy with a new
effective date and notify Tenant owners **by email and by an in-app notification within the
Service.** That notification may arrive at or after the time the change takes effect, not
necessarily before it. Changes to this Policy apply prospectively and do not affect charges
already made under the version of this Policy in effect at the time of that charge.

---

## 8. Contact Us

Questions about a specific charge, or requests under Section 5, can be sent to
**info@joinnorthstack.com**.

Northstack is operated by Alejandro Bravo, based in Buenos Aires, Argentina.
