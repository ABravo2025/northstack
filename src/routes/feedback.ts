import { findTenantNameById } from '../modules/tenant/tenantService.js';
import { sendFeedbackEmail } from '../lib/mailer.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

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

  return res.status(204).end();
});
