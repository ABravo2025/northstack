import { sendSignupVerificationEmail } from '../lib/mailer.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

// TEMPORARY — 2026-08-25, round 2. The bestEffort-awaited fix deployed but the real signup
// verification email still isn't arriving; bestEffort's catch swallows the actual error, so this
// calls the real sendSignupVerificationEmail directly and surfaces whatever it throws (or
// confirms it doesn't throw at all, meaning the drop is happening after send() resolves). Delete
// this file and its app.ts import the moment this is answered.
export const mailerDiagnostic2Router = createAsyncRouter();

const DIAGNOSTIC_TOKEN = '25d33b07-f45d-450c-9857-62235f500387847c9d80-4762-4d7c-998f-5423ec80bea2';

mailerDiagnostic2Router.get('/api/internal/_mailer-diagnostic2', async (req, res) => {
  if (req.headers.authorization !== `Bearer ${DIAGNOSTIC_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  if (!to) {
    return res.status(400).json({ error: 'Missing ?to=' });
  }

  let threw = false;
  let errorMessage: string | undefined;
  try {
    await sendSignupVerificationEmail({
      to,
      verifyUrl: 'https://app.joinnorthstack.com/register/complete?token=diagnostic-test',
    });
  } catch (err) {
    threw = true;
    errorMessage = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  }

  return res.json({ threw, errorMessage });
});
