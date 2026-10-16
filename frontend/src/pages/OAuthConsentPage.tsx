import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';

// OAuth consent for AI assistants (spec-mcp-server.md §4.1) — where an assistant (claude.ai,
// ChatGPT, Claude Code, Cursor…) sends the person after they paste Northstack's MCP URL into it.
// Reached only when signed in (App.tsx sends everyone else to /login and back here). Approving
// returns the browser to the assistant with a one-time code; the assistant then acts AS this
// person, with exactly their role — nothing on this page grants anything beyond that.

interface OAuthConsentPageProps {
  token: string;
  user: { firstName: string; lastName: string; email: string };
  tenantName: string | null;
}

interface ConsentContext {
  clientName: string;
  redirectHost: string;
  blocked: 'plan' | 'permission' | null;
}

export default function OAuthConsentPage({ token, user, tenantName }: OAuthConsentPageProps) {
  const { t } = useTranslation('auth');
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const [context, setContext] = useState<ConsentContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getOAuthConsentContext(token, params.toString())
      .then(setContext)
      .catch((err) => setError((err as Error).message));
  }, [token, params]);

  const decide = async (decision: 'approve' | 'deny') => {
    setBusy(true);
    try {
      const body = Object.fromEntries(params.entries());
      const { redirectTo } = await api.decideOAuthConsent(token, { ...body, decision });
      window.location.assign(redirectTo);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="header">
        <img src="/logo-horizontal-light.svg" alt="Northstack" className="dark:hidden" />
        <img src="/logo-horizontal-dark.svg" alt="Northstack" className="hidden dark:block" />
      </div>
      <div className="container">
        <div className="card mx-auto mt-10 max-w-md">
          {error ? (
            <>
              <h2 className="text-center">{t('oauthConsent.errorTitle')}</h2>
              <div className="alert alert-error">{error}</div>
            </>
          ) : !context ? (
            <p className="text-center">{t('oauthConsent.loading')}</p>
          ) : context.blocked ? (
            <>
              <h2 className="text-center">{t('oauthConsent.blockedTitle')}</h2>
              <div className="alert alert-info">{t(`oauthConsent.blocked.${context.blocked}`)}</div>
              <button type="button" className="btn-secondary btn-md w-full" disabled={busy} onClick={() => decide('deny')}>
                {t('oauthConsent.back', { client: context.clientName })}
              </button>
            </>
          ) : (
            <>
              <h2 className="text-center">{t('oauthConsent.title', { client: context.clientName })}</h2>
              <p className="text-center text-sm">
                {t('oauthConsent.as', { name: `${user.firstName} ${user.lastName}`, email: user.email })}
                {tenantName ? <> · <strong>{tenantName}</strong></> : null}
              </p>
              <ul className="my-4 flex list-disc flex-col gap-2 pl-5 text-sm">
                <li>{t('oauthConsent.points.actsAsYou')}</li>
                <li>{t('oauthConsent.points.areas')}</li>
                <li>{t('oauthConsent.points.confirm')}</li>
                <li>{t('oauthConsent.points.activity', { client: context.clientName })}</li>
                <li>{t('oauthConsent.points.revoke')}</li>
              </ul>
              <p className="mb-4 text-xs text-ink-muted dark:text-dark-ink-muted">
                {t('oauthConsent.redirectNote', { host: context.redirectHost })}
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary btn-md flex-1" disabled={busy} onClick={() => decide('deny')}>
                  {t('oauthConsent.deny')}
                </button>
                <button type="button" className="btn-primary btn-md flex-1" disabled={busy} onClick={() => decide('approve')}>
                  {busy ? t('oauthConsent.connecting') : t('oauthConsent.approve')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
