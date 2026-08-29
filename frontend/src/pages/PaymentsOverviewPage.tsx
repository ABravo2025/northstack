import { useEffect, useState } from 'react';
import { api, type PaymentsOverview } from '../api';
import { useToast } from '../components/common/ToastProvider';
import TableSkeleton from '../components/common/TableSkeleton';
import CompanyPaymentHistoryModal from '../components/crm/CompanyPaymentHistoryModal';
import { formatMoney } from '../lib/currencies';

interface PaymentsOverviewPageProps {
  token: string;
  user: any;
}

// Payments v1, Unit 3 (spec-payments-v1.md) — everything here is live against Stripe, no local
// store (see the spec's decision #7): a page load fans out one summary call per linked Company
// (src/modules/integrations/stripePaymentsService.ts's getPaymentsOverview), so the loading state
// below matters more than it would for an ordinary list page.
export default function PaymentsOverviewPage({ token, user }: PaymentsOverviewPageProps) {
  const toast = useToast();
  const [overview, setOverview] = useState<PaymentsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState<{ id: string; name: string } | null>(null);
  const isOwner = user.role === 'owner';

  useEffect(() => {
    if (!isOwner) return;
    setLoading(true);
    api
      .getPaymentsOverview(token)
      .then(setOverview)
      .catch((error) => toast.error('Failed to load payments overview: ' + (error as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isOwner]);

  // Same client-side guard pattern as PayrollPage.tsx — a non-owner guessing the URL sees a
  // clean message instead of a broken page, on top of the 403 the endpoints already give.
  if (!isOwner) {
    return (
      <div className="container">
        <div className="page-toolbar">
          <h2 className="page-title">Payments</h2>
        </div>
        <p className="text-sm text-ink-muted">Payments is only visible to the tenant owner.</p>
      </div>
    );
  }

  return (
    <div className="page-full">
      <div className="page-toolbar">
        <h2>Payments</h2>
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : !overview?.connected ? (
        <p className="mt-4 text-sm text-ink-muted dark:text-dark-ink-muted">
          Connect your Stripe account first — go to Settings → Integrations.
        </p>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card">
              <p className="text-xs text-ink-muted dark:text-dark-ink-muted">Refunds</p>
              <p className="text-lg font-semibold">
                {overview.totals.refundsCount}
                {overview.totals.refundsCount > 0 && overview.totals.currency && (
                  <span className="ml-1 text-xs text-ink-faint">
                    ({formatMoney(overview.totals.refundsAmountCents, overview.totals.currency.toUpperCase())})
                  </span>
                )}
              </p>
            </div>
            <div className="card">
              <p className="text-xs text-ink-muted dark:text-dark-ink-muted">Failed payments</p>
              <p className="text-lg font-semibold">{overview.totals.failedCount}</p>
            </div>
            <div className="card">
              <p className="text-xs text-ink-muted dark:text-dark-ink-muted">Active subscriptions</p>
              <p className="text-lg font-semibold">{overview.totals.activeSubscriptions}</p>
            </div>
            <div className="card">
              <p className="text-xs text-ink-muted dark:text-dark-ink-muted">Companies linked</p>
              <p className="text-lg font-semibold">{overview.companies.length}</p>
            </div>
          </div>

          {overview.companies.length === 0 ? (
            <p className="text-sm text-ink-muted dark:text-dark-ink-muted">
              No Companies linked to Stripe yet — open a Company and use "Search on Stripe" under Payments.
            </p>
          ) : (
            <div className="full-table-wrap">
              <table className="table full-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Refunds</th>
                    <th>Failed</th>
                    <th>Subscription</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.companies.map((row) => (
                    <tr key={row.companyId}>
                      <td>
                        <button
                          type="button"
                          className="table-link"
                          onClick={() => setSelectedCompany({ id: row.companyId, name: row.companyName })}
                        >
                          {row.companyName}
                        </button>
                      </td>
                      <td>
                        {row.summary.refundsCount}
                        {row.summary.refundsCount > 0 && row.summary.currency && (
                          <span className="ml-1 text-xs text-ink-faint">
                            ({formatMoney(row.summary.refundsAmountCents, row.summary.currency.toUpperCase())})
                          </span>
                        )}
                      </td>
                      <td>{row.summary.failedCount}</td>
                      <td>{row.summary.subscriptionStatus ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {selectedCompany && (
        <CompanyPaymentHistoryModal
          open={selectedCompany !== null}
          onClose={() => setSelectedCompany(null)}
          token={token}
          companyId={selectedCompany.id}
          companyName={selectedCompany.name}
        />
      )}
    </div>
  );
}
