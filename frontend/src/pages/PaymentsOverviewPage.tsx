import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, type PaymentsOverview, type PaymentsOverviewRow } from '../api';
import { useToast } from '../components/common/ToastProvider';
import TableSkeleton from '../components/common/TableSkeleton';
import EntityCardList from '../components/common/EntityCardList';
import CompanyPaymentHistoryModal from '../components/crm/CompanyPaymentHistoryModal';
import { formatMoney } from '../lib/currencies';
import { usePermissions } from '../contexts/PermissionsContext';

interface PaymentsOverviewPageProps {
  token: string;
}

// Unpaid money first: overdue invoices, then any open invoice, so a pending invoice can't get
// lost further down the list. Otherwise keeps the backend's order.
function sortByOutstanding(rows: PaymentsOverviewRow[]): PaymentsOverviewRow[] {
  return [...rows].sort(
    (a, b) =>
      b.summary.overdueInvoicesCount - a.summary.overdueInvoicesCount ||
      b.summary.openInvoicesCount - a.summary.openInvoicesCount,
  );
}

function OpenInvoicesCell({ row }: { row: PaymentsOverviewRow }) {
  const { t } = useTranslation('crm');
  const { summary } = row;
  if (!summary.invoicesAccessible) {
    return (
      <span className="text-ink-faint" title={t('payments.invoicesUnavailable')}>
        —
      </span>
    );
  }
  if (summary.openInvoicesCount === 0) return <span className="text-ink-faint">0</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="font-medium">{summary.openInvoicesCount}</span>
      {summary.openInvoicesCurrency && (
        <span className="text-xs text-ink-faint">
          ({formatMoney(summary.openInvoicesAmountCents, summary.openInvoicesCurrency.toUpperCase())})
        </span>
      )}
      {summary.overdueInvoicesCount > 0 && (
        <span className="category-chip chip-coral">{t('payments.overdueCount', { count: summary.overdueInvoicesCount })}</span>
      )}
    </span>
  );
}

function openInvoicesMeta(row: PaymentsOverviewRow, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!row.summary.invoicesAccessible || row.summary.openInvoicesCount === 0) return '';
  const overdue =
    row.summary.overdueInvoicesCount > 0 ? ` (${t('payments.overdueCount', { count: row.summary.overdueInvoicesCount })})` : '';
  return `${t('payments.openInvoicesMeta', { count: row.summary.openInvoicesCount })}${overdue} · `;
}

// Payments v1, Unit 3 (spec-payments-v1.md) — everything here is live against Stripe, no local
// store (see the spec's decision #7): a page load fans out one summary call per linked Company
// (src/modules/integrations/stripePaymentsService.ts's getPaymentsOverview), so the loading state
// below matters more than it would for an ordinary list page.
export default function PaymentsOverviewPage({ token }: PaymentsOverviewPageProps) {
  const { t } = useTranslation('crm');
  const toast = useToast();
  const [overview, setOverview] = useState<PaymentsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState<{ id: string; name: string } | null>(null);
  // Custom Roles Fase J — migrated off `user.role === 'owner'` to the real backend gate,
  // canManagePayments (owner-only by default, but a real toggleable permission).
  const permissions = usePermissions();
  const canManagePayments = permissions.has('manage_payments');

  useEffect(() => {
    if (!canManagePayments) return;
    setLoading(true);
    api
      .getPaymentsOverview(token)
      .then(setOverview)
      .catch((error) => toast.error(t('payments.toastLoadFailed', { error: (error as Error).message })))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canManagePayments]);

  // Same client-side guard pattern as PayrollPage.tsx — a role without access guessing the URL
  // sees a clean message instead of a broken page, on top of the 403 the endpoints already give.
  if (!canManagePayments) {
    return (
      <div className="container">
        <div className="page-toolbar">
          <h2 className="page-title">{t('payments.pageTitle')}</h2>
        </div>
        <p className="text-sm text-ink-muted">{t('payments.noPermission')}</p>
      </div>
    );
  }

  return (
    <div className="page-full page-narrow">
      <div className="page-toolbar">
        <h2>{t('payments.pageTitle')}</h2>
        {/* The headline numbers live in Dashboards → Payments since 2026-10; this page is the per-Company list. */}
        <Link to="/dashboards/payments" className="btn-secondary ml-auto">
          {t('payments.viewDashboard')}
        </Link>
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : !overview?.connected ? (
        <p className="mt-4 text-sm text-ink-muted dark:text-dark-ink-muted">{t('payments.connectStripeFirst')}</p>
      ) : (
        <>
          {overview.companies.length === 0 ? (
            <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('payments.noCompaniesLinked')}</p>
          ) : (
            <>
            <EntityCardList
              items={sortByOutstanding(overview.companies)}
              getKey={(row) => row.companyId}
              getInitials={(row) => row.companyName.slice(0, 2).toUpperCase()}
              getName={(row) => row.companyName}
              getMeta={(row) =>
                `${openInvoicesMeta(row, t)}${t('payments.refundsCount', { count: row.summary.refundsCount })} · ${t('payments.failedCountLabel', { count: row.summary.failedCount })} · ${row.summary.subscriptionStatus ?? t('payments.noSubscription')}`
              }
              onSelect={(row) => setSelectedCompany({ id: row.companyId, name: row.companyName })}
            />
            <div className="full-table-wrap has-mobile-cards">
              <table className="table full-table">
                <thead>
                  <tr>
                    <th>{t('payments.columns.company')}</th>
                    <th>{t('payments.columns.openInvoices')}</th>
                    <th>{t('payments.columns.refunds')}</th>
                    <th>{t('payments.columns.failed')}</th>
                    <th>{t('payments.columns.subscription')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortByOutstanding(overview.companies).map((row) => (
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
                        <OpenInvoicesCell row={row} />
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
            </>
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
