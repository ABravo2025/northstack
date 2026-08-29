import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type Company, type StripeCustomerMatch, type StripePaymentEvent, type StripePaymentSummary } from '../../api';
import { useToast } from '../common/ToastProvider';
import ConfirmDialog from '../common/ConfirmDialog';
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

const EVENT_LABEL: Record<StripePaymentEvent['type'], string> = {
  charge_succeeded: 'Payment',
  charge_failed: 'Failed payment',
  charge_refunded: 'Refund',
};

export default function CompanyStripeSection({ token, company, onLinked }: CompanyStripeSectionProps) {
  const toast = useToast();
  const [apiKeyMode, setApiKeyMode] = useState<'test' | 'live' | null>(null);
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<StripeCustomerMatch[] | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<StripeCustomerMatch | null>(null);
  const [summary, setSummary] = useState<StripePaymentSummary | null>(null);
  const [events, setEvents] = useState<StripePaymentEvent[]>([]);
  const [eventsCursor, setEventsCursor] = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);

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
      setEvents([]);
      setEventsCursor(null);
      return;
    }
    api
      .getCompanyPaymentSummary(token, company.id)
      .then(setSummary)
      .catch((error) => toast.error('Failed to load payment summary: ' + (error as Error).message));
    loadEvents(undefined, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id, company.stripeCustomerId]);

  const loadEvents = async (cursor: string | undefined, replace: boolean) => {
    setLoadingEvents(true);
    try {
      const page = await api.getCompanyPaymentEvents(token, company.id, cursor);
      setEvents((prev) => (replace ? page.events : [...prev, ...page.events]));
      setEventsCursor(page.nextCursor);
    } catch (error) {
      toast.error('Failed to load payment history: ' + (error as Error).message);
    } finally {
      setLoadingEvents(false);
    }
  };

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
      toast.success('Linked to Stripe.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setPendingOverwrite(match);
        return;
      }
      toast.error('Failed to link: ' + (error as Error).message);
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
              Connected to Stripe →
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Link to={`/payments/companies/${company.id}`} className="table-link text-xs">
              View full payment history →
            </Link>
            <button type="button" className="table-link text-xs" onClick={handleSearch} disabled={searching}>
              {searching ? 'Searching…' : 'Change link'}
            </button>
          </div>
        </div>

        {summary && (
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-muted dark:text-dark-ink-muted">
            <span>
              Refunds: {summary.refundsCount}
              {summary.refundsCount > 0 && summary.currency && ` (${formatMoney(summary.refundsAmountCents, summary.currency.toUpperCase())})`}
            </span>
            <span>Failed payments: {summary.failedCount}</span>
            <span>Subscription: {summary.subscriptionStatus ?? '—'}</span>
          </div>
        )}

        {events.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {events.map((event) => (
              <div key={event.id} className="flex items-center justify-between text-xs">
                <a href={event.dashboardUrl} target="_blank" rel="noreferrer" className="table-link">
                  {EVENT_LABEL[event.type]} · {formatMoney(event.amountCents, event.currency.toUpperCase())}
                </a>
                <div className="flex items-center gap-2">
                  {event.receiptUrl && (
                    <a href={event.receiptUrl} target="_blank" rel="noreferrer" className="table-link">
                      Receipt
                    </a>
                  )}
                  <span className="text-ink-faint">{new Date(event.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
            {eventsCursor && (
              <button
                type="button"
                className="table-link self-start text-xs"
                onClick={() => loadEvents(eventsCursor, false)}
                disabled={loadingEvents}
              >
                {loadingEvents ? 'Loading…' : 'Load more'}
              </button>
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
            title="Replace the existing Stripe link?"
            message="This Company is already linked to a different Stripe customer. Linking it to this one instead will replace the existing link."
            confirmLabel="Replace"
            onConfirm={() => link(pendingOverwrite, true)}
            onCancel={() => setPendingOverwrite(null)}
          />
        )}
      </>
    );
  }

  return (
    <div>
      <button type="button" className="btn-secondary btn-md" onClick={handleSearch} disabled={searching}>
        {searching ? 'Searching…' : 'Search on Stripe'}
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
  if (matches.length === 0) {
    return (
      <p className="mt-2 text-xs text-ink-faint">
        No matching Stripe customers found for this Company's contacts. Create the customer in Stripe first, or
        double-check the contact emails.
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-1 rounded-md border border-line p-2 dark:border-gray-800">
      {matches.map((match) => (
        <div key={match.id} className="flex items-center justify-between gap-2 py-0.5 text-sm">
          <span>
            {match.name || match.email || match.id}
            <span className="ml-1 text-xs text-ink-faint">(via {match.matchedViaEmail})</span>
          </span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => onPick(match)} disabled={linkingId === match.id}>
            {linkingId === match.id ? 'Linking…' : 'Link'}
          </button>
        </div>
      ))}
      <button type="button" className="table-link self-start text-xs" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
