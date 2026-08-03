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
}

export async function sendInvitationEmail(input: SendInvitationEmailInput): Promise<void> {
  if (!mailerConfigured()) return;

  await transporter.sendMail({
    from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
    to: input.to,
    subject: `You're invited to join ${input.tenantName} on Northstack`,
    text: [
      `You've been invited to join ${input.tenantName} on Northstack as ${input.role}.`,
      '',
      `Accept your invitation: ${input.acceptUrl}`,
      '',
      'This link expires in 7 days.',
    ].join('\n'),
    html: [
      `<p>You've been invited to join <strong>${input.tenantName}</strong> on Northstack as <strong>${input.role}</strong>.</p>`,
      `<p><a href="${input.acceptUrl}">Accept your invitation</a></p>`,
      '<p>This link expires in 7 days.</p>',
    ].join('\n'),
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
