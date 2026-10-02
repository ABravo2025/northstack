import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StatTile from '../../components/metrics/StatTile';
import { api, type PaymentsOverview } from '../../api';
import { formatMoney } from '../../lib/currencies';
import type { DashboardsOutletContext } from '../../layouts/DashboardsLayout';

// Payments headline numbers — moved here from the /payments page (2026-10) so that page is just
// the per-Company table. Live from Stripe like the page itself (no local store), so it's a
// snapshot of "right now" and ignores the dashboards date range.
export default function DashboardsPaymentsPage() {
  const { t } = useTranslation('dashboards');
  const { t: tc } = useTranslation('crm');
  const { token } = useOutletContext<DashboardsOutletContext>();
  const [overview, setOverview] = useState<PaymentsOverview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .getPaymentsOverview(token)
      .then(setOverview)
      .catch(() => setFailed(true));
  }, [token]);

  if (failed) return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('payments.loadFailed')}</p>;
  if (!overview) return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('common.loading')}</p>;
  if (!overview.connected) return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{tc('payments.connectStripeFirst')}</p>;

  const { totals } = overview;
  const money = (cents: number, currency: string | null) => (currency ? formatMoney(cents, currency.toUpperCase()) : undefined);
  const openSubtitle = [
    totals.openInvoicesCount > 0 ? money(totals.openInvoicesAmountCents, totals.openInvoicesCurrency) : undefined,
    totals.overdueInvoicesCount > 0 ? tc('payments.overdueCount', { count: totals.overdueInvoicesCount }) : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div>
      <p className="mb-4 text-sm text-ink-muted dark:text-dark-ink-muted">{t('payments.liveNote')}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label={tc('payments.stats.openInvoices')} value={String(totals.openInvoicesCount)} subtitle={openSubtitle || undefined} />
        <StatTile
          label={tc('payments.stats.refunds')}
          value={String(totals.refundsCount)}
          subtitle={totals.refundsCount > 0 ? money(totals.refundsAmountCents, totals.currency) : undefined}
        />
        <StatTile label={tc('payments.stats.failedPayments')} value={String(totals.failedCount)} />
        <StatTile label={tc('payments.stats.activeSubscriptions')} value={String(totals.activeSubscriptions)} />
        <StatTile label={tc('payments.stats.companiesLinked')} value={String(overview.companies.length)} />
      </div>
    </div>
  );
}
