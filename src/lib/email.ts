// Leaf module (no imports) — shared by authService.ts, tenantService.ts, and
// publicFormService.ts, none of which should depend on each other for something this generic.
const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailFormatValid(email: string): boolean {
  return EMAIL_FORMAT_REGEX.test(email.trim());
}

// Lowercased domain portion of an email, or '' if there's no '@'. Also backs User.emailDomain,
// set at every user-creation call site so domain-uniqueness checks (tenantService.ts's
// checkEmailDomainNotAlreadyRegistered) can do an indexed equality lookup instead of a
// full-table `endsWith` scan.
export function getEmailDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? '';
}
