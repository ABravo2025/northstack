// Client-side-only shape check, used to gate when a value counts as
// "complete" for auto-save/auto-create triggers — the backend stays the
// source of truth for real validation (format, uniqueness), this just avoids
// firing mid-keystroke on an obviously unfinished address.
export function isLikelyValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
