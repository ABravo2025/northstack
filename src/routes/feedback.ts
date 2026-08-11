import { findTenantNameById } from '../modules/tenant/tenantService.js';
import { sendFeedbackEmail } from '../lib/mailer.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { createIdea, createTicket } from '../modules/platform/platformTicketService.js';

export const feedbackRouter = createAsyncRouter();

// Unlike the other email sends in this app, feedback is not best-effort — the
// email IS the point of the request, so a delivery failure should surface as
// an error the user can see and retry, not a silent 204.
feedbackRouter.post('/api/feedback', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const message = (req.body.message ?? '').trim();
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const type = req.body.type as string | undefined;
  if (type !== undefined && type !== 'ticket' && type !== 'idea') {
    return res.status(400).json({ error: "type must be 'ticket' or 'idea'" });
  }

  const subject = (req.body.subject ?? '').trim();
  if (type && !subject) {
    return res.status(400).json({ error: 'Subject is required' });
  }

  if (!process.env.FEEDBACK_EMAIL) {
    console.error('POST /api/feedback: FEEDBACK_EMAIL is not configured');
    return res.status(500).json({ error: 'Feedback is not configured on the server' });
  }

  const tenantName = user.tenantId ? await findTenantNameById(user.tenantId) : null;

  try {
    await sendFeedbackEmail({
      to: process.env.FEEDBACK_EMAIL,
      fromName: `${user.firstName} ${user.lastName}`,
      fromEmail: user.email,
      tenantName: tenantName ?? 'Unknown tenant',
      pageUrl: req.body.pageUrl ?? 'unknown',
      message,
    });
  } catch (err) {
    console.error('Failed to send feedback email:', err);
    return res.status(502).json({ error: "Couldn't send your feedback right now. Please try again." });
  }

  // Persistence is additive to the email notice, not a replacement for it
  // (see spec-admin-center-tickets-ideas.md section 4). Runs after the email
  // succeeds so a failed send — which the caller will retry — doesn't leave
  // a duplicate Ticket/Idea behind.
  if (type === 'ticket') {
    await createTicket({ tenantId: user.tenantId!, userId: user.id, createdByType: 'user', subject, description: message });
  } else if (type === 'idea') {
    await createIdea({ tenantId: user.tenantId!, userId: user.id, createdByType: 'user', subject, description: message });
  }

  return res.status(204).end();
});
