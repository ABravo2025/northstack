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
  if (!process.env.ZOHO_SMTP_USER || !process.env.ZOHO_SMTP_PASSWORD) {
    console.warn('Email sending skipped: ZOHO_SMTP_USER/ZOHO_SMTP_PASSWORD not configured');
    return;
  }

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
