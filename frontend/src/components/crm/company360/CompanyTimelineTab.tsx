import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, type CompanyTimelineEvent } from '../../../api';

// Clientes C5: one timeline of the account — deals and their moves, hand-off, products, notes,
// finished tasks and survey answers (score only), newest first.
const DOT: Record<string, string> = {
  won: 'bg-emerald-500',
  lost: 'bg-red-500',
  handoff: 'bg-accent dark:bg-brand-blue-light',
  product_cancelled: 'bg-red-400',
  survey_answered: 'bg-amber-500',
};

export default function CompanyTimelineTab({ token, companyId }: { token: string; companyId: string }) {
  const { t, i18n } = useTranslation('crm');
  const navigate = useNavigate();
  const [events, setEvents] = useState<CompanyTimelineEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getCompanyTimeline(token, companyId)
      .then(setEvents)
      .catch((e) => setError((e as Error).message));
  }, [token, companyId]);

  const when = (iso: string) => new Date(iso).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="overview-panel-left">
      <div className="field-group border-b-0">
        <h4 className="field-group-title">{t('company360.tabs.timeline')}</h4>
        {error ? (
          <p className="text-sm">{error}</p>
        ) : events === null ? (
          <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('company360.loading')}</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('company360.timeline.empty')}</p>
        ) : (
          <ol className="m-0 flex list-none flex-col p-0">
            {events.map((e, i) => (
              <li key={i} className="flex gap-3 border-b border-line py-2 last:border-b-0 dark:border-dark-line">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[e.kind] ?? 'bg-ink-faint dark:bg-dark-ink-faint'}`} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm">
                    <span className="text-ink-muted dark:text-dark-ink-muted">{t(`company360.timeline.kind.${e.kind}`)}: </span>
                    {e.href ? (
                      <button type="button" className="to-link" onClick={() => navigate(e.href!)}>
                        {e.title}
                      </button>
                    ) : (
                      <strong className="font-medium">{e.title}</strong>
                    )}
                  </span>
                  {e.detail && <span className="truncate text-xs text-ink-muted dark:text-dark-ink-muted">{e.detail}</span>}
                </span>
                <span className="shrink-0 text-xs text-ink-faint dark:text-dark-ink-faint">{when(e.at)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
