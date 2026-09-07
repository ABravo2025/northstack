import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma.js';
import { sendSignupVerificationEmail } from '../../lib/mailer.js';
import { bestEffort } from '../../lib/bestEffort.js';
import { checkEmailDomainNotAlreadyRegistered } from './tenantService.js';
import { isEmailFormatValid } from '../../lib/email.js';

// 24h — long enough someone can click the link later the same day from their phone, short
// enough a stale/unclicked link doesn't sit around forever. Independent of
// PASSWORD_RESET_EXPIRY_MS (1h, authService.ts) and INVITATION_EXPIRY_MS (7 days,
// invitationService.ts) — this confirms an email address, it isn't a credential.
const SIGNUP_VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

export interface StartSignupVerificationResult {
  success: boolean;
  error?: string;
  field?: string;
}

// Backs both POST /api/tenants/signup/start and /resend — spec-tenant-signup.md describes
// them as functionally identical, so both routes call this same function.
export async function startSignupVerification(email: string): Promise<StartSignupVerificationResult> {
  const normalizedEmail = email.toLowerCase().trim();

  if (!isEmailFormatValid(normalizedEmail)) {
    return { success: false, error: 'Please enter a valid email address', field: 'email' };
  }

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) {
    return { success: false, error: 'Email already registered', field: 'email' };
  }

  const domainCheck = await checkEmailDomainNotAlreadyRegistered(normalizedEmail);
  if (domainCheck.blocked) {
    return { success: false, error: domainCheck.error, field: 'email' };
  }

  // Reuse a still-unexpired row for this email instead of always deleting+recreating — a
  // person is expected to click the link, land on CompleteSignupPage, and only submit the
  // survey minutes later. A second request in that window (Resend email, a duplicate tab, a
  // slow first email) must never invalidate the token their in-progress tab already holds, or
  // the final submit rejects it out of nowhere and their whole survey is lost (confirmed
  // 2026-09-07: a resend killed the original token mid-survey, final submit failed with
  // "This verification link is invalid. Please start over."). Reusing also refreshes
  // expiresAt, matching the "expires in 24 hours" copy shown on every send, including resends.
  // Only a genuinely expired (or nonexistent) row gets replaced with a fresh token.
  const existing = await prisma.emailVerification.findFirst({
    where: { email: normalizedEmail },
    orderBy: { createdAt: 'desc' },
  });

  let token: string;
  if (existing && existing.expiresAt > new Date()) {
    token = existing.token;
    await prisma.emailVerification.update({
      where: { id: existing.id },
      data: { expiresAt: new Date(Date.now() + SIGNUP_VERIFICATION_EXPIRY_MS) },
    });
  } else {
    token = randomUUID();
    await prisma.emailVerification.deleteMany({ where: { email: normalizedEmail } });
    await prisma.emailVerification.create({
      data: { email: normalizedEmail, token, expiresAt: new Date(Date.now() + SIGNUP_VERIFICATION_EXPIRY_MS) },
    });
  }

  const appBaseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173';
  // Best-effort, same reasoning as every other transactional send in mailer.ts: the row
  // already exists regardless of whether this particular send succeeds. Must still be awaited,
  // not fire-and-forget — see bestEffort.ts's header (confirmed live 2026-08-25: this exact
  // call site was silently dropping every signup verification email in production because it
  // wasn't awaited).
  await bestEffort(
    sendSignupVerificationEmail({
      to: normalizedEmail,
      verifyUrl: `${appBaseUrl}/register/complete?token=${token}`,
    }),
    'Failed to send signup verification email:',
  );

  return { success: true };
}

export interface VerifySignupTokenResult {
  success: boolean;
  email?: string;
  error?: string;
  status?: number; // 404 (not found) vs 410 (expired) — spec-tenant-signup.md
}

// GET /api/tenants/signup/verify/:token, public. Idempotent: reopening or refreshing the
// same link after it already succeeded returns the same { email } again, not an error — the
// person may have clicked it, gotten distracted, and come back to the same tab later.
export async function verifySignupToken(token: string): Promise<VerifySignupTokenResult> {
  const record = await prisma.emailVerification.findUnique({ where: { token } });
  if (!record) {
    return { success: false, error: 'This verification link is invalid.', status: 404 };
  }

  // Expiry always wins, even over a link that was already clicked — otherwise a link clicked
  // hours ago but abandoned mid-survey keeps reporting success here while the final submit
  // (validateAndConsumeEmailVerification in tenantService.ts, which does check this) rejects it.
  if (record.expiresAt < new Date()) {
    return { success: false, error: 'This verification link has expired.', status: 410 };
  }

  if (record.verifiedAt) {
    return { success: true, email: record.email };
  }

  const updated = await prisma.emailVerification.update({
    where: { id: record.id },
    data: { verifiedAt: new Date() },
  });

  return { success: true, email: updated.email };
}
