import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api';
import type { Company, StripePaymentEvent } from '../api';
import { useToast } from '../components/common/ToastProvider';
import TableSkeleton from '../components/common/TableSkeleton';
import { formatMoney } from '../lib/currencies';
import { ChevronLeftIcon } from '../components/common/Icons';

interface CompanyPaymentHistoryPageProps {
  token: string;
  user: any;
}

const STATUS_LABEL: Record<StripePaymentEvent['type'], string> = {
  charge_succeeded: 'Paid',
  charge_failed: 'Failed',
  charge_refunded: 'Refunded',
};

// Reached from PaymentsOverviewPage's Company link and from CompanyStripeSection's "View full
// payment history" link — the full, paginated version of the abbreviated list that already lives
// inline in CompanyDetailModal.
export default function CompanyPaymentHistoryPage({ token, user }: CompanyPaymentHistoryPageProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const { companyId } = useParams<{ companyId: string }>();
  const isOwner = user?.role === 'owner';
  const [company, setCompany] = useState<Company | null>(null);
  const [events, setEvents] = useState<StripePaymentEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!companyId || !isOwner) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([api.listCompanies(token), api.getCompanyPaymentEvents(token, companyId)])
      .then(([companies, page]) => {
        setCompany(companies.find((c) => c.id === companyId) ?? null);
        setEvents(page.events);
        setCursor(page.nextCursor);
      })
      .catch((error) => toast.error('Failed to load payment history: ' + (error as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, isOwner]);

  const loadMore = async () => {
    if (!companyId || !cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.getCompanyPaymentEvents(token, companyId, cursor);
      setEvents((prev) => [...prev, ...page.events]);
      setCursor(page.nextCursor);
    } catch (error) {
      toast.error('Failed to load more payments: ' + (error as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

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
    <div className="container">
      <div className="page-toolbar">
        <div className="flex items-center gap-2">
          <button type="button" className="icon-btn" onClick={() => navigate('/payments')} aria-label="Back to Payments">
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <h2 className="page-title">{company?.name || 'Payment history'}</h2>
        </div>
        {companyId && (
          <Link to={`/companies?open=${companyId}`} className="table-link text-sm">
            View company profile →
          </Link>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : events.length === 0 ? (
        <p className="text-sm text-ink-muted dark:text-dark-ink-muted">No payments recorded for this company yet.</p>
      ) : (
        <div className="full-table-wrap">
          <table className="table full-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{new Date(event.createdAt).toLocaleDateString()}</td>
                  <td>{formatMoney(event.amountCents, event.currency.toUpperCase())}</td>
                  <td>{STATUS_LABEL[event.type]}</td>
                  <td>
                    {event.receiptUrl ? (
                      <a href={event.receiptUrl} target="_blank" rel="noreferrer" className="table-link">
                        View receipt →
                      </a>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cursor && (
        <button type="button" className="btn-secondary btn-sm mt-3" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
