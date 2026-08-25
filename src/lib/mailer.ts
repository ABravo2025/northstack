import nodemailer from 'nodemailer';

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
}

export async function sendInvitationEmail(input: SendInvitationEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  const hasContract = Boolean(input.attachments?.length);

  await transporter.sendMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject: `You're invited to join ${input.tenantName} on Northstack`,
    text: [
      `You've been invited to join ${input.tenantName} on Northstack as ${input.role}.`,
      '',
      `Accept your invitation: ${input.acceptUrl}`,
      '',
      hasContract ? 'Your contract is attached to this email for your records.\n' : '',
      'This link expires in 7 days.',
    ].join('\n'),
    html: [
      `<p>You've been invited to join <strong>${input.tenantName}</strong> on Northstack as <strong>${input.role}</strong>.</p>`,
      `<p><a href="${input.acceptUrl}">Accept your invitation</a></p>`,
      hasContract ? '<p>Your contract is attached to this email for your records.</p>' : '',
      '<p>This link expires in 7 days.</p>',
    ].join('\n'),
    attachments: input.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: 'application/pdf' })),
  });
}

function mailerConfigured(): boolean {
  if (!process.env.ZOHO_SMTP_USER || !process.env.ZOHO_SMTP_PASSWORD) {
    console.warn('Email sending skipped: ZOHO_SMTP_USER/ZOHO_SMTP_PASSWORD not configured');
    return false;
  }
  return true;
}

export interface SendPublicFormSubmissionEmailInput {
  to: string;
  tenantName: string;
  formName: string;
  submitterName: string;
  submitterEmail: string;
}

export async function sendPublicFormSubmissionEmail(input: SendPublicFormSubmissionEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  await transporter.sendMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject: `New submission on "${input.formName}"`,
    text: [
      `${input.submitterName} (${input.submitterEmail}) just submitted "${input.formName}" for ${input.tenantName}.`,
    ].join('\n'),
    html: [
      `<p><strong>${input.submitterName}</strong> (${input.submitterEmail}) just submitted <strong>${input.formName}</strong> for ${input.tenantName}.</p>`,
    ].join('\n'),
  });
}

export interface SendPublicFormConfirmationEmailInput {
  to: string;
  tenantName: string;
  formName: string;
}

export async function sendPublicFormConfirmationEmail(input: SendPublicFormConfirmationEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  await transporter.sendMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject: `We received your submission — ${input.formName}`,
    text: [`Thanks! ${input.tenantName} received your submission for "${input.formName}".`].join('\n'),
    html: [`<p>Thanks! ${input.tenantName} received your submission for <strong>${input.formName}</strong>.</p>`].join(
      '\n',
    ),
  });
}

export interface SendTimeOffRequestPendingEmailInput {
  to: string;
  approverName: string;
  employeeName: string;
  policyName: string;
  startDate: string;
  endDate: string;
  daysRequested: number;
}

export async function sendTimeOffRequestPendingEmail(input: SendTimeOffRequestPendingEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  const range = input.startDate === input.endDate ? input.startDate : `${input.startDate} – ${input.endDate}`;

  await transporter.sendMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject: `Time off request awaiting your approval`,
    text: [
      `Hi ${input.approverName},`,
      '',
      `${input.employeeName} requested ${input.daysRequested} day(s) of ${input.policyName} (${range}) and it needs your approval.`,
      '',
      'Review it in Northstack under HR > Time Off.',
    ].join('\n'),
    html: [
      `<p>Hi ${input.approverName},</p>`,
      `<p><strong>${input.employeeName}</strong> requested ${input.daysRequested} day(s) of <strong>${input.policyName}</strong> (${range}) and it needs your approval.</p>`,
      '<p>Review it in Northstack under HR &gt; Time Off.</p>',
    ].join('\n'),
  });
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
}

export async function sendTimeOffRequestDecidedEmail(input: SendTimeOffRequestDecidedEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  const range = input.startDate === input.endDate ? input.startDate : `${input.startDate} – ${input.endDate}`;
  const subject = input.recipientIsEmployee
    ? `Your time off request was ${input.decision}`
    : `${input.employeeName}'s time off request was ${input.decision}${input.autoApproved ? ' automatically' : ''}`;
  const intro = input.recipientIsEmployee
    ? `Your request for ${input.daysRequested} day(s) of ${input.policyName} (${range}) was ${input.decision}${
        input.autoApproved ? ' automatically — this policy does not require approval' : ''
      }.`
    : `${input.employeeName}'s request for ${input.daysRequested} day(s) of ${input.policyName} (${range}) was ${
        input.decision
      }${input.autoApproved ? ' automatically — this policy does not require approval' : ''}.`;

  await transporter.sendMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject,
    text: [intro, input.decisionNote ? `\nNote: ${input.decisionNote}` : ''].join('\n'),
    html: [`<p>${intro}</p>`, input.decisionNote ? `<p>Note: ${input.decisionNote}</p>` : ''].join('\n'),
  });
}

export interface SendFeedbackEmailInput {
  to: string;
  fromName: string;
  fromEmail: string;
  tenantName: string;
  pageUrl: string;
  message: string;
}

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
      `<p><strong>From:</strong> ${input.fromName} &lt;${input.fromEmail}&gt; (${input.tenantName})</p>`,
      `<p><strong>Page:</strong> ${input.pageUrl}</p>`,
      `<p>${input.message.replace(/\n/g, '<br />')}</p>`,
    ].join('\n'),
  });
}

export interface SendContractSignedEmailInput {
  to: string;
  cc?: string[];
  tenantName: string;
  employeeName: string;
  pdfBuffer: Buffer;
}

// Fired once, right after contract confirmation (docs/spec-payroll.md Unidad
// 7) — the signer gets their own copy, cc'd to the tenant owner and whoever
// created the contract (EmployeeCompensation.createdByUserId), so there's a
// paper trail beyond just what's stored in the app.
export async function sendContractSignedEmail(input: SendContractSignedEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  await transporter.sendMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    cc: input.cc && input.cc.length > 0 ? input.cc : undefined,
    subject: `Signed contract — ${input.employeeName} (${input.tenantName})`,
    text: [
      `${input.employeeName}'s contract with ${input.tenantName} was just confirmed and signed.`,
      '',
      'The signed contract is attached to this email.',
    ].join('\n'),
    html: [
      `<p><strong>${input.employeeName}</strong>'s contract with <strong>${input.tenantName}</strong> was just confirmed and signed.</p>`,
      '<p>The signed contract is attached to this email.</p>',
    ].join('\n'),
    attachments: [{ filename: 'contract-signed.pdf', content: input.pdfBuffer, contentType: 'application/pdf' }],
  });
}

export interface SendPasswordResetEmailInput {
  to: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  await transporter.sendMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject: 'Reset your Northstack password',
    text: [
      'We received a request to reset your Northstack password.',
      '',
      `Reset your password: ${input.resetUrl}`,
      '',
      'This link expires in 1 hour. If you did not request this, you can safely ignore this email.',
    ].join('\n'),
    html: [
      '<p>We received a request to reset your Northstack password.</p>',
      `<p><a href="${input.resetUrl}">Reset your password</a></p>`,
      '<p>This link expires in 1 hour. If you did not request this, you can safely ignore this email.</p>',
    ].join('\n'),
  });
}

export interface SendSignupVerificationEmailInput {
  to: string;
  verifyUrl: string;
}

// Tenant Signup (spec-tenant-signup.md) — sent from POST /api/tenants/signup/start and
// /resend, before any Tenant/User exists yet. Same best-effort pattern as the rest of this
// file: the EmailVerification row is already created regardless of whether this send
// succeeds, so a flaky SMTP call doesn't block the (already information-free) response.
export async function sendSignupVerificationEmail(input: SendSignupVerificationEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  await transporter.sendMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject: 'Verify your email to finish setting up Northstack',
    text: [
      "Thanks for starting your Northstack signup — let's confirm this is your email.",
      '',
      `Verify your email: ${input.verifyUrl}`,
      '',
      'This link expires in 24 hours. If you did not request this, you can safely ignore this email.',
    ].join('\n'),
    html: [
      "<p>Thanks for starting your Northstack signup — let's confirm this is your email.</p>",
      `<p><a href="${input.verifyUrl}">Verify your email</a></p>`,
      '<p>This link expires in 24 hours. If you did not request this, you can safely ignore this email.</p>',
    ].join('\n'),
  });
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
}

// docs/tareas/specredisenosalesv2.md §3.8 — fires alongside the in-app
// Notification whenever someone other than the deal's owner moves its stage.
// Links to the Kanban board, not the deal itself — there's no per-Opportunity
// URL today (the detail view is component state, not a route).
export async function sendOpportunityStageChangedEmail(input: SendOpportunityStageChangedEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  const actor = input.changedByName ? ` by ${input.changedByName}` : '';

  await transporter.sendMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject: `${input.opportunityName} moved to ${input.toStage}`,
    text: [
      `Hi ${input.ownerFirstName},`,
      '',
      `"${input.opportunityName}" (${input.companyName}) moved from ${input.fromStage} to ${input.toStage}${actor}.`,
      '',
      `View your pipeline: ${input.appUrl}`,
    ].join('\n'),
    html: [
      `<p>Hi ${input.ownerFirstName},</p>`,
      `<p><strong>${input.opportunityName}</strong> (${input.companyName}) moved from ${input.fromStage} to <strong>${input.toStage}</strong>${actor}.</p>`,
      `<p><a href="${input.appUrl}">View your pipeline</a></p>`,
    ].join('\n'),
  });
}

export interface SendOpportunityStalledEmailInput {
  to: string;
  ownerFirstName: string;
  opportunityName: string;
  companyName: string;
  stageName: string;
  daysInStage: number;
  appUrl: string;
}

// docs/tareas/specredisenosalesv2.md §3.8 — the stalled-deal reminder cron's
// email half, alongside the in-app Notification. Same "no per-deal URL" note
// as above.
export async function sendOpportunityStalledEmail(input: SendOpportunityStalledEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  await transporter.sendMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject: `${input.opportunityName} has been stalled for ${input.daysInStage} days`,
    text: [
      `Hi ${input.ownerFirstName},`,
      '',
      `"${input.opportunityName}" (${input.companyName}) has been sitting in ${input.stageName} for ${input.daysInStage} days.`,
      '',
      `View your pipeline: ${input.appUrl}`,
    ].join('\n'),
    html: [
      `<p>Hi ${input.ownerFirstName},</p>`,
      `<p><strong>${input.opportunityName}</strong> (${input.companyName}) has been sitting in <strong>${input.stageName}</strong> for ${input.daysInStage} days.</p>`,
      `<p><a href="${input.appUrl}">View your pipeline</a></p>`,
    ].join('\n'),
  });
}

export interface SendTicketNoteCreatedEmailInput {
  to: string;
  ticketSubject: string;
  authorName: string;
  noteBody: string;
}

export async function sendTicketNoteCreatedEmail(input: SendTicketNoteCreatedEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  await transporter.sendMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject: `New reply on your ticket: "${input.ticketSubject}"`,
    text: [`${input.authorName} replied to your ticket "${input.ticketSubject}":`, '', input.noteBody].join('\n'),
    html: [
      `<p><strong>${input.authorName}</strong> replied to your ticket <strong>${input.ticketSubject}</strong>:</p>`,
      `<p>${input.noteBody}</p>`,
    ].join('\n'),
  });
}
