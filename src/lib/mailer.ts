import nodemailer from 'nodemailer';
import { bestEffort } from './bestEffort.js';
import i18n, { resolveEmailLocale } from './i18n.js';

// Opportunity/company names, stage labels, and display names are all tenant-user-controlled free
// text that gets interpolated into HTML email bodies below — escape before interpolating so a
// name like `<a href="...">` can't inject markup/links into a transactional email sent from
// Northstack's own domain.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Wraps an already-escaped, tenant-controlled value in <strong> for the HTML body of an email —
// paired with the plain value for the text body, both built from the same i18next template key
// (docs/general/spec-i18n.md Unidad 9) so the sentence itself only needs to be translated once.
function strong(value: string): string {
  return `<strong>${escapeHtml(value)}</strong>`;
}

const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.ZOHO_SMTP_USER,
    pass: process.env.ZOHO_SMTP_PASSWORD,
  },
});

export interface SendInvitationEmailInput {
  to: string;
  tenantName: string;
  role: string;
  acceptUrl: string;
  attachments?: { filename: string; content: Buffer }[];
  // Recipient has no account yet at invite time (see invitationService.ts) — most call sites
  // pass nothing, which falls back to English (resolveEmailLocale(undefined) === 'en').
  locale?: string | null;
}

export async function sendInvitationEmail(input: SendInvitationEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  const lng = resolveEmailLocale(input.locale);
  const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, { lng, ns: 'emails', ...opts });
  const hasContract = Boolean(input.attachments?.length);

  await dispatchMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject: t('invitation.subject', { tenantName: input.tenantName }),
    text: [
      t('invitation.intro', { tenantName: input.tenantName, role: input.role }),
      '',
      `${t('invitation.acceptLinkText')}: ${input.acceptUrl}`,
      '',
      hasContract ? `${t('invitation.contractNote')}\n` : '',
      t('invitation.expiry'),
    ].join('\n'),
    html: [
      `<p>${t('invitation.intro', { tenantName: strong(input.tenantName), role: strong(input.role) })}</p>`,
      `<p><a href="${input.acceptUrl}">${t('invitation.acceptLinkText')}</a></p>`,
      hasContract ? `<p>${t('invitation.contractNote')}</p>` : '',
      `<p>${t('invitation.expiry')}</p>`,
    ].join('\n'),
    attachments: input.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: 'application/pdf' })),
  }, 'Failed to send invitation email:');
}

function mailerConfigured(): boolean {
  if (!process.env.ZOHO_SMTP_USER || !process.env.ZOHO_SMTP_PASSWORD) {
    console.warn('Email sending skipped: ZOHO_SMTP_USER/ZOHO_SMTP_PASSWORD not configured');
    return false;
  }
  return true;
}

// Single choke point every send*Email function below routes through instead of calling
// transporter.sendMail directly. On Vercel, an un-awaited promise can be killed mid-flight the
// moment the HTTP response goes out — confirmed 2026-08-25, when that exact gap silently dropped
// every production signup verification email even though the SMTP send itself worked fine when
// awaited (see bestEffort.ts). Routing every send through this one function means a future email
// type can't reintroduce that bug by skipping the wrapping some call site forgot to apply —
// callers just `await sendXEmail(...)` and the safety is already built in.
function dispatchMail(mailOptions: Parameters<typeof transporter.sendMail>[0], errorLabel: string): Promise<void> {
  return bestEffort(transporter.sendMail(mailOptions), errorLabel);
}

export interface SendPublicFormSubmissionEmailInput {
  to: string;
  tenantName: string;
  formName: string;
  submitterName: string;
  submitterEmail: string;
  // Recipient is a tenant admin — a real User, so callers should pass their `.locale`.
  locale?: string | null;
}

export async function sendPublicFormSubmissionEmail(input: SendPublicFormSubmissionEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  const lng = resolveEmailLocale(input.locale);
  const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, { lng, ns: 'emails', ...opts });

  await dispatchMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject: t('publicFormSubmission.subject', { formName: input.formName }),
    text: [
      t('publicFormSubmission.body', {
        submitterName: input.submitterName,
        submitterEmail: input.submitterEmail,
        formName: input.formName,
        tenantName: input.tenantName,
      }),
    ].join('\n'),
    html: [
      `<p>${t('publicFormSubmission.body', {
        submitterName: strong(input.submitterName),
        submitterEmail: escapeHtml(input.submitterEmail),
        formName: strong(input.formName),
        tenantName: escapeHtml(input.tenantName),
      })}</p>`,
    ].join('\n'),
  }, 'Failed to send public form submission email:');
}

export interface SendPublicFormConfirmationEmailInput {
  to: string;
  tenantName: string;
  formName: string;
  // The external submitter has no Northstack account — no locale to resolve, always English
  // unless a future signup flow captures a preference before this fires.
  locale?: string | null;
}

export async function sendPublicFormConfirmationEmail(input: SendPublicFormConfirmationEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  const lng = resolveEmailLocale(input.locale);
  const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, { lng, ns: 'emails', ...opts });

  await dispatchMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject: t('publicFormConfirmation.subject', { formName: input.formName }),
    text: [t('publicFormConfirmation.body', { tenantName: input.tenantName, formName: input.formName })].join('\n'),
    html: [
      `<p>${t('publicFormConfirmation.body', { tenantName: escapeHtml(input.tenantName), formName: strong(input.formName) })}</p>`,
    ].join('\n'),
  }, 'Failed to send public form confirmation email:');
}

export interface SendTimeOffRequestPendingEmailInput {
  to: string;
  approverName: string;
  employeeName: string;
  policyName: string;
  startDate: string;
  endDate: string;
  daysRequested: number;
  locale?: string | null;
}

export async function sendTimeOffRequestPendingEmail(input: SendTimeOffRequestPendingEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  const lng = resolveEmailLocale(input.locale);
  const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, { lng, ns: 'emails', ...opts });
  const range = input.startDate === input.endDate ? input.startDate : `${input.startDate} – ${input.endDate}`;

  await dispatchMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject: t('timeOffPending.subject'),
    text: [
      t('timeOffPending.greeting', { approverName: input.approverName }),
      '',
      t('timeOffPending.body', {
        employeeName: input.employeeName,
        daysRequested: input.daysRequested,
        policyName: input.policyName,
        range,
      }),
      '',
      t('timeOffPending.cta'),
    ].join('\n'),
    html: [
      `<p>${t('timeOffPending.greeting', { approverName: escapeHtml(input.approverName) })}</p>`,
      `<p>${t('timeOffPending.body', {
        employeeName: strong(input.employeeName),
        daysRequested: input.daysRequested,
        policyName: strong(input.policyName),
        range,
      })}</p>`,
      `<p>${t('timeOffPending.cta')}</p>`,
    ].join('\n'),
  }, 'Failed to send time off pending email:');
}

export interface SendTimeOffRequestDecidedEmailInput {
  to: string;
  recipientIsEmployee: boolean;
  employeeName: string;
  policyName: string;
  startDate: string;
  endDate: string;
  daysRequested: number;
  decision: 'approved' | 'rejected';
  decisionNote?: string | null;
  autoApproved?: boolean;
  locale?: string | null;
}

export async function sendTimeOffRequestDecidedEmail(input: SendTimeOffRequestDecidedEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  const lng = resolveEmailLocale(input.locale);
  const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, { lng, ns: 'emails', ...opts });
  const range = input.startDate === input.endDate ? input.startDate : `${input.startDate} – ${input.endDate}`;
  const decisionKey = input.decision === 'approved' ? 'Approved' : 'Rejected';

  const subject = input.recipientIsEmployee
    ? t(`timeOffDecided.subjectEmployee${decisionKey}`)
    : t(`timeOffDecided.subjectOther${decisionKey}`, {
        employeeName: input.employeeName,
        autoNote: input.autoApproved ? t('timeOffDecided.autoNote') : '',
      });

  const autoSuffix = input.autoApproved ? t('timeOffDecided.autoSuffix') : '';
  const introKeyBase = input.recipientIsEmployee ? 'timeOffDecided.introEmployee' : 'timeOffDecided.introOther';
  const intro = t(`${introKeyBase}${decisionKey}`, {
    employeeName: input.employeeName,
    daysRequested: input.daysRequested,
    policyName: input.policyName,
    range,
    autoSuffix,
  });
  const introHtml = t(`${introKeyBase}${decisionKey}`, {
    employeeName: strong(input.employeeName),
    daysRequested: input.daysRequested,
    policyName: strong(input.policyName),
    range,
    autoSuffix,
  });

  await dispatchMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject,
    text: [intro, input.decisionNote ? `\n${t('timeOffDecided.note', { note: input.decisionNote })}` : ''].join('\n'),
    html: [
      `<p>${introHtml}</p>`,
      input.decisionNote ? `<p>${t('timeOffDecided.note', { note: escapeHtml(input.decisionNote) })}</p>` : '',
    ].join('\n'),
  }, 'Failed to send time off decided email:');
}

export interface SendFeedbackEmailInput {
  to: string;
  fromName: string;
  fromEmail: string;
  tenantName: string;
  pageUrl: string;
  message: string;
}

// Internal-only (from a customer, to Northstack's own team via the in-app feedback form) — not
// part of the i18n rollout, this is never seen by a tenant user in either language.
// Unlike every other function in this file, feedback is NOT best-effort (see feedback.ts's own
// header comment) — the email IS the point of the request, so a delivery failure has to
// propagate as a rejection the route can turn into a 502, not get swallowed like a
// dispatchMail() failure would. Calls transporter.sendMail directly for that reason.
export async function sendFeedbackEmail(input: SendFeedbackEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  await transporter.sendMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    replyTo: input.fromEmail,
    subject: `Feedback from ${input.tenantName}`,
    text: [
      `From: ${input.fromName} <${input.fromEmail}> (${input.tenantName})`,
      `Page: ${input.pageUrl}`,
      '',
      input.message,
    ].join('\n'),
    html: [
      `<p><strong>From:</strong> ${escapeHtml(input.fromName)} &lt;${escapeHtml(input.fromEmail)}&gt; (${escapeHtml(input.tenantName)})</p>`,
      `<p><strong>Page:</strong> ${escapeHtml(input.pageUrl)}</p>`,
      `<p>${escapeHtml(input.message).replace(/\n/g, '<br />')}</p>`,
    ].join('\n'),
  });
}

export interface SendContractSignedEmailInput {
  to: string;
  cc?: string[];
  tenantName: string;
  employeeName: string;
  pdfBuffer: Buffer;
  locale?: string | null;
}

// Fired once, right after contract confirmation (docs/spec-payroll.md Unidad
// 7) — the signer gets their own copy, cc'd to the tenant owner and whoever
// created the contract (EmployeeCompensation.createdByUserId), so there's a
// paper trail beyond just what's stored in the app.
export async function sendContractSignedEmail(input: SendContractSignedEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  const lng = resolveEmailLocale(input.locale);
  const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, { lng, ns: 'emails', ...opts });

  await dispatchMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    cc: input.cc && input.cc.length > 0 ? input.cc : undefined,
    subject: t('contractSigned.subject', { employeeName: input.employeeName, tenantName: input.tenantName }),
    text: [
      t('contractSigned.body', { employeeName: input.employeeName, tenantName: input.tenantName }),
      '',
      t('contractSigned.attachmentNote'),
    ].join('\n'),
    html: [
      `<p>${t('contractSigned.body', { employeeName: strong(input.employeeName), tenantName: strong(input.tenantName) })}</p>`,
      `<p>${t('contractSigned.attachmentNote')}</p>`,
    ].join('\n'),
    attachments: [{ filename: 'contract-signed.pdf', content: input.pdfBuffer, contentType: 'application/pdf' }],
  }, 'Failed to send contract signed email:');
}

export interface SendPasswordResetEmailInput {
  to: string;
  resetUrl: string;
  locale?: string | null;
}

export async function sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  const lng = resolveEmailLocale(input.locale);
  const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, { lng, ns: 'emails', ...opts });

  await dispatchMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject: t('passwordReset.subject'),
    text: [
      t('passwordReset.body'),
      '',
      `${t('passwordReset.linkText')}: ${input.resetUrl}`,
      '',
      t('passwordReset.expiry'),
    ].join('\n'),
    html: [
      `<p>${t('passwordReset.body')}</p>`,
      `<p><a href="${input.resetUrl}">${t('passwordReset.linkText')}</a></p>`,
      `<p>${t('passwordReset.expiry')}</p>`,
    ].join('\n'),
  }, 'Failed to send password reset email:');
}

export interface SendSignupVerificationEmailInput {
  to: string;
  verifyUrl: string;
  // No User exists yet at this point in the signup flow (see emailVerificationService.ts) — no
  // locale to resolve, always falls back to English. A future enhancement could thread the
  // frontend's currently-active UI language through here instead; deliberately out of scope for
  // this pass (docs/general/spec-i18n.md Unidad 9).
  locale?: string | null;
}

// Tenant Signup (spec-tenant-signup.md) — sent from POST /api/tenants/signup/start and
// /resend, before any Tenant/User exists yet. Same best-effort pattern as the rest of this
// file: the EmailVerification row is already created regardless of whether this send
// succeeds, so a flaky SMTP call doesn't block the (already information-free) response.
export async function sendSignupVerificationEmail(input: SendSignupVerificationEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  const lng = resolveEmailLocale(input.locale);
  const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, { lng, ns: 'emails', ...opts });

  await dispatchMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject: t('signupVerification.subject'),
    text: [
      t('signupVerification.body'),
      '',
      `${t('signupVerification.linkText')}: ${input.verifyUrl}`,
      '',
      t('signupVerification.expiry'),
    ].join('\n'),
    html: [
      `<p>${t('signupVerification.body')}</p>`,
      `<p><a href="${input.verifyUrl}">${t('signupVerification.linkText')}</a></p>`,
      `<p>${t('signupVerification.expiry')}</p>`,
    ].join('\n'),
  }, 'Failed to send signup verification email:');
}

export interface SendOpportunityStageChangedEmailInput {
  to: string;
  ownerFirstName: string;
  opportunityName: string;
  companyName: string;
  fromStage: string;
  toStage: string;
  changedByName?: string;
  appUrl: string;
  locale?: string | null;
}

// docs/tareas/specredisenosalesv2.md §3.8 — fires alongside the in-app
// Notification whenever someone other than the deal's owner moves its stage.
// Links to the Kanban board, not the deal itself — there's no per-Opportunity
// URL today (the detail view is component state, not a route).
export async function sendOpportunityStageChangedEmail(input: SendOpportunityStageChangedEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  const lng = resolveEmailLocale(input.locale);
  const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, { lng, ns: 'emails', ...opts });
  const actor = input.changedByName ? t('opportunityStageChanged.actorSuffix', { changedByName: input.changedByName }) : '';
  const actorHtml = input.changedByName
    ? t('opportunityStageChanged.actorSuffix', { changedByName: strong(input.changedByName) })
    : '';

  await dispatchMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject: t('opportunityStageChanged.subject', { opportunityName: input.opportunityName, toStage: input.toStage }),
    text: [
      t('opportunityStageChanged.greeting', { ownerFirstName: input.ownerFirstName }),
      '',
      t('opportunityStageChanged.body', {
        opportunityName: input.opportunityName,
        companyName: input.companyName,
        fromStage: input.fromStage,
        toStage: input.toStage,
        actor,
      }),
      '',
      `${t('opportunityStageChanged.cta')}: ${input.appUrl}`,
    ].join('\n'),
    html: [
      `<p>${t('opportunityStageChanged.greeting', { ownerFirstName: escapeHtml(input.ownerFirstName) })}</p>`,
      `<p>${t('opportunityStageChanged.body', {
        opportunityName: strong(input.opportunityName),
        companyName: escapeHtml(input.companyName),
        fromStage: escapeHtml(input.fromStage),
        toStage: strong(input.toStage),
        actor: actorHtml,
      })}</p>`,
      `<p><a href="${input.appUrl}">${t('opportunityStageChanged.cta')}</a></p>`,
    ].join('\n'),
  }, 'Failed to send opportunity stage changed email:');
}

export interface SendOpportunityStalledEmailInput {
  to: string;
  ownerFirstName: string;
  opportunityName: string;
  companyName: string;
  stageName: string;
  daysInStage: number;
  appUrl: string;
  locale?: string | null;
}

// docs/tareas/specredisenosalesv2.md §3.8 — the stalled-deal reminder cron's
// email half, alongside the in-app Notification. Same "no per-deal URL" note
// as above.
export async function sendOpportunityStalledEmail(input: SendOpportunityStalledEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  const lng = resolveEmailLocale(input.locale);
  const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, { lng, ns: 'emails', ...opts });

  await dispatchMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject: t('opportunityStalled.subject', { opportunityName: input.opportunityName, daysInStage: input.daysInStage }),
    text: [
      t('opportunityStalled.greeting', { ownerFirstName: input.ownerFirstName }),
      '',
      t('opportunityStalled.body', {
        opportunityName: input.opportunityName,
        companyName: input.companyName,
        stageName: input.stageName,
        daysInStage: input.daysInStage,
      }),
      '',
      `${t('opportunityStalled.cta')}: ${input.appUrl}`,
    ].join('\n'),
    html: [
      `<p>${t('opportunityStalled.greeting', { ownerFirstName: escapeHtml(input.ownerFirstName) })}</p>`,
      `<p>${t('opportunityStalled.body', {
        opportunityName: strong(input.opportunityName),
        companyName: escapeHtml(input.companyName),
        stageName: strong(input.stageName),
        daysInStage: input.daysInStage,
      })}</p>`,
      `<p><a href="${input.appUrl}">${t('opportunityStalled.cta')}</a></p>`,
    ].join('\n'),
  }, 'Failed to send opportunity stalled email:');
}

export interface SendTicketNoteCreatedEmailInput {
  to: string;
  ticketSubject: string;
  authorName: string;
  noteBody: string;
  locale?: string | null;
}

export async function sendTicketNoteCreatedEmail(input: SendTicketNoteCreatedEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  const lng = resolveEmailLocale(input.locale);
  const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, { lng, ns: 'emails', ...opts });

  await dispatchMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject: t('ticketNoteCreated.subject', { ticketSubject: input.ticketSubject }),
    // noteBody is the ticket reply itself, written by a person — never translated, rendered as-is
    // in whatever language they wrote it (docs/general/spec-i18n.md's hard rule on user content).
    text: [t('ticketNoteCreated.body', { authorName: input.authorName, ticketSubject: input.ticketSubject }), '', input.noteBody].join('\n'),
    html: [
      `<p>${t('ticketNoteCreated.body', { authorName: strong(input.authorName), ticketSubject: strong(input.ticketSubject) })}</p>`,
      `<p>${escapeHtml(input.noteBody)}</p>`,
    ].join('\n'),
  }, 'Failed to send ticket note email:');
}

export interface SendPolicyChangeEmailInput {
  to: string;
  firstName: string;
  policyTitle: string;
  summary: string;
  appUrl: string;
  locale?: string | null;
}

// Terms of Service §14 (and the matching sections in Privacy/Refund) promise "notified via
// email and an in-app notification" for policy changes, without prior notice — this fulfills
// the email half. Sent to every active tenant user, not gated by any future notification
// preferences (a legal notice, not a marketing/product email).
export async function sendPolicyChangeEmail(input: SendPolicyChangeEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  const lng = resolveEmailLocale(input.locale);
  const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, { lng, ns: 'emails', ...opts });

  await dispatchMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject: t('policyChange.subject', { policyTitle: input.policyTitle }),
    text: [
      t('policyChange.greeting', { firstName: input.firstName }),
      '',
      t('policyChange.intro', { policyTitle: input.policyTitle }),
      '',
      // summary is authored per-change by whoever publishes the announcement (not hardcoded UI
      // copy) — left untranslated, same reasoning as noteBody above.
      input.summary,
      '',
      `${t('policyChange.cta')}: ${input.appUrl}`,
    ].join('\n'),
    html: [
      `<p>${t('policyChange.greeting', { firstName: escapeHtml(input.firstName) })}</p>`,
      `<p>${t('policyChange.intro', { policyTitle: strong(input.policyTitle) })}</p>`,
      `<p>${escapeHtml(input.summary)}</p>`,
      `<p><a href="${input.appUrl}">${t('policyChange.cta')}</a></p>`,
    ].join('\n'),
  }, 'Failed to send policy change email:');
}
