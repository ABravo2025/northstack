// Mirrors src/lib/featureFlags.ts's isPublicFormsEnabled — same flag, frontend side. Vite bakes
// import.meta.env.VITE_* at build time, so this is fixed per-deployment (per Vercel environment),
// not something that can flip at runtime.
export function isPublicFormsEnabled(): boolean {
  return import.meta.env.VITE_PUBLIC_FORMS_ENABLED === 'true';
}
