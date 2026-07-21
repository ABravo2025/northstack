import { useEffect, useState } from 'react';

type LegalDoc = 'terms' | 'privacy';

const DOC_TITLES: Record<LegalDoc, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
};

const DOC_URLS: Record<LegalDoc, string> = {
  terms: 'https://joinnorthstack.com/terms.html',
  privacy: 'https://joinnorthstack.com/privacy.html',
};

interface LegalDocumentModalProps {
  initialDoc: LegalDoc;
  onClose: () => void;
}

export default function LegalDocumentModal({ initialDoc, onClose }: LegalDocumentModalProps) {
  const [doc, setDoc] = useState<LegalDoc>(initialDoc);
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setHtml(null);

    fetch(DOC_URLS[doc])
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
  }, [doc]);

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
    const href = anchor.getAttribute('href') || '';
    if (href === '/terms.html') {
      e.preventDefault();
      setDoc('terms');
    } else if (href === '/privacy.html') {
      e.preventDefault();
      setDoc('privacy');
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
          <h3 id="legal-modal-title">{DOC_TITLES[doc]}</h3>
          <button type="button" className="legal-modal-close" onClick={onClose} aria-label="Close">
            &#10005;
          </button>
        </div>
        <div className="legal-modal-body">
          {loading && <p className="legal-modal-status">Loading…</p>}
          {error && (
            <p className="legal-modal-status">
              Couldn't load this document right now.{' '}
              <a href={DOC_URLS[doc]} target="_blank" rel="noopener noreferrer">
                Open it in a new tab
              </a>{' '}
              instead.
            </p>
          )}
          {html && <div onClick={handleContentClick} dangerouslySetInnerHTML={{ __html: html }} />}
        </div>
      </div>
    </div>
  );
}
