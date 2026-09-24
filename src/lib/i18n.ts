import i18next from 'i18next';
import enEmails from '../locales/en/emails.json' with { type: 'json' };
import esEmails from '../locales/es/emails.json' with { type: 'json' };

// Server-side i18next — no browser language detector (there is no browser here), and no single
// "current language" the way the frontend has one: a request can send emails to recipients with
// different locales, so every call passes `lng` explicitly instead of relying on a global
// active language. See docs/general/spec-i18n.md Unidad 9.
i18next.init({
  resources: {
    en: { emails: enEmails },
    es: { emails: esEmails },
  },
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: ['en', 'es'],
  defaultNS: 'emails',
  interpolation: { escapeValue: false },
});

// Locale stored on User.locale is nullable ('en' | 'es' | null) — this is the one place that
// null/undefined/anything-unrecognized resolves to 'en', so every call site below can just pass
// `user.locale` straight through without its own fallback logic.
export function resolveEmailLocale(locale: string | null | undefined): 'en' | 'es' {
  return locale === 'es' ? 'es' : 'en';
}

export default i18next;
