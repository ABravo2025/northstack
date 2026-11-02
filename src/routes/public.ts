import { confirmContract, getContractConfirmationDetails } from '../modules/hr/contractConfirmationService.js';
import { sanitizeUser } from '../modules/auth/authService.js';
import { isRateLimited } from '../lib/rateLimit.js';
import { getClientIp } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { getTenantLogo } from '../modules/tenant/tenantProfileService.js';

export const publicRouter = createAsyncRouter();

// Public, unauthenticated: powers the standalone /confirm-contract/:token
// page (docs/spec-payroll.md Unidad 7) — no session exists yet, the person
// isn't a User until they submit the POST below.
publicRouter.get('/api/public/contract-confirmation/:token', async (req, res) => {
  const result = await getContractConfirmationDetails(req.params.token);
  if (!result.success) {
    return res.status(404).json({ error: result.error });
  }
  return res.json(result.details);
});

publicRouter.post('/api/public/contract-confirmation/:token', async (req, res) => {
  const clientIp = getClientIp(req);
  if (await isRateLimited(`contract-confirmation:${clientIp}`)) {
    return res.status(429).json({ error: 'Too many attempts. Please try again in a minute.' });
  }

  const result = await confirmContract({
    token: req.params.token,
    phone: req.body.phone ?? '',
    password: req.body.password ?? '',
    countryOfResidence: req.body.countryOfResidence ?? '',
    paymentMethodId: req.body.paymentMethodId ?? '',
    paymentAccountSubType: req.body.paymentAccountSubType || null,
    paymentAccountData: req.body.paymentAccountData ?? '',
    taxId: typeof req.body.taxId === 'string' ? req.body.taxId : undefined,
    acceptedContract: req.body.acceptedContract === true,
    acceptedTerms: req.body.acceptedTerms === true,
    ip: clientIp,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error, field: result.field });
  }

  return res.status(200).json({ user: sanitizeUser(result.user!), session: result.session });
});

// Public, unauthenticated: the company logo (Settings → Company), served as an image so it can
// be shown in the app sidebar and embedded in invitation emails (mail clients fetch it with no
// session). Only the logo bytes are exposed — keyed by the tenant's UUID, not
// its slug. The `?v=<logoUpdatedAt>` query the frontend/emails append changes on every upload,
// so the response can be cached as immutable.
publicRouter.get('/api/public/tenant-logo/:tenantId', async (req, res) => {
  const logo = await getTenantLogo(req.params.tenantId);
  if (!logo) {
    return res.status(404).json({ error: 'Logo not found' });
  }
  res.setHeader('Content-Type', logo.mimeType);
  res.setHeader('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
  return res.send(logo.bytes);
});
