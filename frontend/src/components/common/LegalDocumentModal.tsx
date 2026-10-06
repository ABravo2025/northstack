import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL, apiFetch } from '../../api/http';
import type { ReferralRules } from '../../api/referrals';

// 'referral' (2026-10-04): the referral program terms. Same modal and styles as the other legal
// documents, but its text lives in the app (EN/ES) with the numbers from the backend's REFERRAL
// config, instead of a page on the landing.
export type LegalDoc = 'terms' | 'privacy' | 'refund' | 'referral';

// Spanish versions live at the same filename under /es/ (2026-10-06) — joinnorthstack.com's own
// language-switcher link pattern. Chosen by the app's current i18n language, not the browser's,
// so it always matches whatever the rest of the UI is showing. Titles/status strings come from
// i18n (common:ui.legal.*) instead of a DOC_TITLES map — that map was retired the same day this
// file's hardcoded English was translated (see the i18n rollout commit this was rebased onto).
const DOC_PATHS: Record<Exclude<LegalDoc, 'referral'>, string> = {
  terms: 'terms.html',
  privacy: 'privacy.html',
  refund: 'refund.html',
};

function docUrl(doc: Exclude<LegalDoc, 'referral'>, language: string): string {
  const path = DOC_PATHS[doc];
  return `https://joinnorthstack.com/${language === 'es' ? 'es/' : ''}${path}`;
}

interface LegalDocumentModalProps {
  initialDoc: LegalDoc;
  onClose: () => void;
}

export default function LegalDocumentModal({ initialDoc, onClose }: LegalDocumentModalProps) {
  const [doc, setDoc] = useState<LegalDoc>(initialDoc);
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [rules, setRules] = useState<ReferralRules | null>(null);
  const { t, i18n } = useTranslation('settingsPages');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setHtml(null);

    if (doc === 'referral') {
      apiFetch(`${API_BASE_URL}/api/public/referral-rules`)
        .then((res) => {
          if (!res.ok) throw new Error('Failed to load rules');
          return res.json();
        })
        .then((r: ReferralRules) => {
          if (!cancelled) setRules(r);
        })
        .catch(() => {
          if (!cancelled) setError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    fetch(docUrl(doc, i18n.language))
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load document');
        return res.text();
      })
      .then((text) => {
        if (cancelled) return;
        const main = new DOMParser().parseFromString(text, 'text/html').querySelector('main');
        if (!main) throw new Error('Document has no content');
        setHtml(main.innerHTML);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [doc, i18n.language]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = (anchor.getAttribute('href') || '').replace(/^\/es\//, '/');
    if (href === '/terms.html') {
      e.preventDefault();
      setDoc('terms');
    } else if (href === '/privacy.html') {
      e.preventDefault();
      setDoc('privacy');
    } else if (href === '/refund.html') {
      e.preventDefault();
      setDoc('refund');
    }
  };

  return (
    <div className="legal-modal-overlay" onClick={onClose}>
      <div
        className="legal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="legal-modal-header">
          <h3 id="legal-modal-title">{doc === 'referral' ? t('referrals.terms.title') : t(`common:ui.legal.${doc}`)}</h3>
          <button type="button" className="legal-modal-close" onClick={onClose} aria-label={t('common:ui.close')}>
            &#10005;
          </button>
        </div>
        <div className="legal-modal-body">
          {loading && <p className="legal-modal-status">{t('common:ui.loading')}</p>}
          {error && doc === 'referral' && <p className="legal-modal-status">{t('common:ui.legal.loadFailed')}</p>}
          {error && doc !== 'referral' && (
            <p className="legal-modal-status">
              {t('common:ui.legal.loadFailed')}{' '}
              <a href={docUrl(doc, i18n.language)} target="_blank" rel="noopener noreferrer">
                {t('common:ui.legal.openNewTab')}
              </a>
            </p>
          )}
          {doc === 'referral' && rules && <ReferralTerms rules={rules} />}
          {html && <div onClick={handleContentClick} dangerouslySetInnerHTML={{ __html: html }} />}
        </div>
      </div>
    </div>
  );
}

// Real section structure (2026-10-06), not a flat bullet list — this is a proper supplementary
// legal document now (see docs/legal/ for its sibling Terms/Privacy/Refund), just rendered from
// i18n + the live REFERRAL config instead of a landing .html page, so its numbers can never drift
// from what the program actually pays (checked against referralService.ts/pricing.ts directly).
const REFERRAL_TERMS_SECTIONS = ['scope', 'eligibility', 'mechanics', 'commissions', 'payouts', 'programChanges', 'relationship', 'changes', 'contact'] as const;

function ReferralTerms({ rules }: { rules: ReferralRules }) {
  const { t, i18n } = useTranslation('settingsPages');
  const money = (currency: 'USD' | 'ARS') =>
    new Intl.NumberFormat(i18n.language === 'es' ? 'es-AR' : 'en-US', { style: 'currency', currency, currencyDisplay: 'code', maximumFractionDigits: 0 }).format(
      (rules.minPayoutCents[currency] ?? 0) / 100,
    );
  const vars = {
    percent: rules.commissionPercent,
    payments: rules.commissionPayments,
    holdDays: rules.holdDays,
    trialDays: rules.trialDays,
    minUsd: money('USD'),
    minArs: money('ARS'),
  };
  return (
    <div>
      <h1>{t('referrals.terms.title')}</h1>
      <span className="effective-date">{t('referrals.terms.version', { version: rules.termsVersion })}</span>
      <p>{t('referrals.terms.intro', vars)}</p>
      {REFERRAL_TERMS_SECTIONS.map((key) => (
        <div key={key}>
          <h2>{t(`referrals.terms.sections.${key}.heading`)}</h2>
          <p>{t(`referrals.terms.sections.${key}.body`, vars)}</p>
        </div>
      ))}
    </div>
  );
}
