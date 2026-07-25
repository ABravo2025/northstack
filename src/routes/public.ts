import { findCustomFieldDefinitionById } from '../modules/hr/customFieldService.js';
import { listFieldCatalogDefinitions } from '../modules/hr/fieldCatalogService.js';
import { findActivePublicForm, submitPublicForm } from '../modules/hr/publicFormService.js';
import { verifyTurnstileToken } from '../lib/turnstile.js';
import { isRateLimited } from '../lib/rateLimit.js';
import { getClientIp } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const publicRouter = createAsyncRouter();

// Public, unauthenticated: powers the standalone /apply/:tenantSlug/:formSlug page.
publicRouter.get('/api/public/:tenantSlug/:formSlug', async (req, res) => {
  const form = await findActivePublicForm(req.params.tenantSlug, req.params.formSlug);
  if (!form) {
    return res.status(404).json({ error: 'Form not found' });
  }

  const fields = JSON.parse(form.fieldsConfig) as { key: string; required: boolean }[];
  const customFieldIds = fields.filter((f) => f.key.startsWith('cf:')).map((f) => f.key.slice(3));
  const customFieldDefs = (await Promise.all(customFieldIds.map((id) => findCustomFieldDefinitionById(id)))).filter(
    (d): d is NonNullable<typeof d> => d !== null,
  );

  // Department is a catalog dropdown now, not free text — only relevant/included
  // when this form actually has that field configured.
  const departmentOptions = fields.some((f) => f.key === 'department')
    ? (await listFieldCatalogDefinitions(form.tenantId, 'department' as any))
        .filter((d) => d.isActive)
        .map((d) => ({ id: d.id, name: d.name }))
    : [];

  return res.json({
    id: form.id,
    name: form.name,
    entityType: form.entityType,
    fields,
    customFieldDefs,
    departmentOptions,
    thankYouMessage: form.thankYouMessage,
  });
});

// Public, unauthenticated: submits the form. Turnstile + a per-IP rate limit
// are the only guards — no session, so anyone with the link can reach this.
publicRouter.post('/api/public/:tenantSlug/:formSlug/submit', async (req, res) => {
  const clientIp = getClientIp(req);
  if (isRateLimited(`public-form:${clientIp}`)) {
    return res.status(429).json({ error: 'Too many submissions. Please try again in a minute.' });
  }

  // Honeypot: a hidden field a real user never fills in. Any value means a bot
  // filled the whole form — fake a normal success without creating anything or
  // spending a Turnstile verification call, so the bot gets no signal it was caught.
  if ((req.body.honeypot ?? '').trim()) {
    return res.status(201).json({ success: true });
  }

  const turnstileValid = await verifyTurnstileToken(req.body.turnstileToken, clientIp);
  if (!turnstileValid) {
    return res.status(400).json({ error: 'CAPTCHA verification failed. Please try again.' });
  }

  const form = await findActivePublicForm(req.params.tenantSlug, req.params.formSlug);
  if (!form) {
    return res.status(404).json({ error: 'Form not found' });
  }

  const result = await submitPublicForm(form, {
    firstName: req.body.firstName ?? '',
    lastName: req.body.lastName ?? '',
    email: req.body.email ?? '',
    values: req.body.values ?? {},
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json({ success: true });
});
