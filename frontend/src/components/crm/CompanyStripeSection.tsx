import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, type Company, type StripeCustomerMatch, type StripePaymentSummary } from '../../api';
import { useToast } from '../common/ToastProvider';
import ConfirmDialog from '../common/ConfirmDialog';
import CompanyPaymentHistoryModal from './CompanyPaymentHistoryModal';
import { formatMoney } from '../../lib/currencies';

interface CompanyStripeSectionProps {
  token: string;
  company: Company;
  // Patches company.stripeCustomerId/stripeCustomerMatchedVia in the parent's list — same
  // "instant patch from the response, no full round-trip" pattern the rest of this modal uses.
  onLinked: (patch: Partial<Company>) => void;
}

function dashboardCustomerUrl(customerId: string, apiKeyMode: 'test' | 'live' | null): string {
  return `https://dashboard.stripe.com/${apiKeyMode === 'test' ? 'test/' : ''}customers/${customerId}`;
}

export default function CompanyStripeSection({ token, company, onLinked }: CompanyStripeSectionProps) {
  const { t } = useTranslation('crm');
  const toast = useToast();
  const [apiKeyMode, setApiKeyMode] = useState<'test' | 'live' | null>(null);
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<StripeCustomerMatch[] | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<StripeCustomerMatch | null>(null);
  const [summary, setSummary] = useState<StripePaymentSummary | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    api
      .getStripeStatus(token)
      .then((status) => setApiKeyMode(status.apiKeyMode))
      .catch(() => {
        /* best-effort — only used to pick the dashboard.stripe.com/test/ prefix */
      });
  }, [token]);

  useEffect(() => {
    if (!company.stripeCustomerId) {
      setSummary(null);
      return;
    }
    api
      .getCompanyPaymentSummary(token, company.id)
      .then(setSummary)
      .catch((error) => toast.error(t('companyStripe.toastSummaryFailed', { error: (error as Error).message })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id, company.stripeCustomerId]);

  const handleSearch = async () => {
    setSearching(true);
    try {
      const { matches } = await api.searchStripeCustomersForCompany(token, company.id);
      setMatches(matches);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const link = async (match: StripeCustomerMatch, confirmOverwrite = false) => {
    setLinkingId(match.id);
    try {
      const updated = await api.linkCompanyToStripe(token, company.id, {
        stripeCustomerId: match.id,
        matchedViaEmail: match.matchedViaEmail,
        confirmOverwrite,
      });
      onLinked(updated);
      setMatches(null);
      setPendingOverwrite(null);
      toast.success(t('companyStripe.toastLinked'));
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setPendingOverwrite(match);
        return;
      }
      toast.error(t('companyStripe.toastLinkFailed', { error: (error as Error).message }));
    } finally {
      setLinkingId(null);
    }
  };

  if (company.stripeCustomerId) {
    return (
      <>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="integration-status-dot integration-status-dot-ok" />
            <a
              href={dashboardCustomerUrl(company.stripeCustomerId, apiKeyMode)}
              target="_blank"
              rel="noreferrer"
              className="table-link text-sm"
            >
              {t('companyStripe.connectedLink')}
            </a>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" className="table-link text-xs" onClick={() => setHistoryOpen(true)}>
              {t('companyStripe.viewFullHistory')}
            </button>
            <button type="button" className="table-link text-xs" onClick={handleSearch} disabled={searching}>
              {searching ? t('common.searching') : t('companyStripe.changeLink')}
            </button>
          </div>
        </div>

        {summary && (
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-muted dark:text-dark-ink-muted">
            <span>
              {t('companyStripe.summary.payments', { count: summary.paymentsCount })}
              {summary.paymentsCount > 0 && summary.currency && ` (${formatMoney(summary.paymentsAmountCents, summary.currency.toUpperCase())})`}
            </span>
            <span>
              {t('companyStripe.summary.refunds', { count: summary.refundsCount })}
              {summary.refundsCount > 0 && summary.currency && ` (${formatMoney(summary.refundsAmountCents, summary.currency.toUpperCase())})`}
            </span>
            <span>
              {t('companyStripe.summary.disputes', { count: summary.disputesCount })}
              {summary.disputesCount > 0 && summary.currency && ` (${formatMoney(summary.disputesAmountCents, summary.currency.toUpperCase())})`}
            </span>
            {summary.firstPaymentAt && (
              <span>
                {t('companyStripe.summary.firstPayment', { date: new Date(summary.firstPaymentAt).toLocaleDateString() })}
              </span>
            )}
          </div>
        )}

        {matches !== null && (
          <StripeMatchList
            matches={matches}
            linkingId={linkingId}
            onPick={(match) => link(match)}
            onCancel={() => setMatches(null)}
          />
        )}

        {pendingOverwrite && (
          <ConfirmDialog
            title={t('companyStripe.confirmReplace.title')}
            message={t('companyStripe.confirmReplace.message')}
            confirmLabel={t('companyStripe.confirmReplace.confirmLabel')}
            onConfirm={() => link(pendingOverwrite, true)}
            onCancel={() => setPendingOverwrite(null)}
          />
        )}

        {historyOpen && (
          <CompanyPaymentHistoryModal
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            token={token}
            companyId={company.id}
            companyName={company.name}
          />
        )}
      </>
    );
  }

  return (
    <div>
      <button type="button" className="btn-secondary btn-md" onClick={handleSearch} disabled={searching}>
        {searching ? t('common.searching') : t('companyStripe.searchButton')}
      </button>
      {matches !== null && (
        <StripeMatchList
          matches={matches}
          linkingId={linkingId}
          onPick={(match) => link(match)}
          onCancel={() => setMatches(null)}
        />
      )}
    </div>
  );
}

function StripeMatchList({
  matches,
  linkingId,
  onPick,
  onCancel,
}: {
  matches: StripeCustomerMatch[];
  linkingId: string | null;
  onPick: (match: StripeCustomerMatch) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('crm');

  if (matches.length === 0) {
    return <p className="mt-2 text-xs text-ink-faint">{t('companyStripe.noMatches')}</p>;
  }

  return (
    <div className="mt-2 flex flex-col gap-1 rounded-md border border-line p-2 dark:border-dark-line">
      {matches.map((match) => (
        <div key={match.id} className="flex items-center justify-between gap-2 py-0.5 text-sm">
          <span>
            {match.name || match.email || match.id}
            <span className="ml-1 text-xs text-ink-faint">
              {t('companyStripe.matchedVia', { email: match.matchedViaEmail })}
            </span>
          </span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => onPick(match)} disabled={linkingId === match.id}>
            {linkingId === match.id ? t('common.linking') : t('common.link')}
          </button>
        </div>
      ))}
      <button type="button" className="table-link self-start text-xs" onClick={onCancel}>
        {t('common.cancel')}
      </button>
    </div>
  );
}
