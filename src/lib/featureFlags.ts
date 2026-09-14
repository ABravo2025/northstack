// Northstack's first feature flag (2026-09-14) — Public Forms isn't ready for production yet
// (business decision, not a technical one) but needs to keep working in whatever environment is
// still testing it. Env-var gated, default OFF: unset in an environment (e.g. Vercel Production)
// hides it there; set to 'true' in Vercel Preview/Development or a local .env to keep testing.
export function isPublicFormsEnabled(): boolean {
  return process.env.PUBLIC_FORMS_ENABLED === 'true';
}
