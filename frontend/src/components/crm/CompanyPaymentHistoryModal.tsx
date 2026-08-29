import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import type { StripePaymentEvent } from '../../api';
import { useToast } from '../common/ToastProvider';
import Modal from '../common/Modal';
import TableSkeleton from '../common/TableSkeleton';
import { formatMoney } from '../../lib/currencies';

interface CompanyPaymentHistoryModalProps {
  open: boolean;
  onClose: () => void;
  token: string;
  companyId: string;
  companyName: string;
}

const STATUS_LABEL: Record<StripePaymentEvent['type'], string> = {
  charge_succeeded: 'Paid',
  charge_failed: 'Failed',
  charge_refunded: 'Refunded',
};

// Reached from PaymentsOverviewPage's Company link and from CompanyStripeSection's "View full
// payment history" link — the full, paginated version of the abbreviated list that already lives
// inline in CompanyDetailModal. A Modal, not a route, to match every other detail view in this app
// (CompanyDetailModal/EmployeeOverviewPanel/etc. are all overlays, not page navigations).
export default function CompanyPaymentHistoryModal({
  open,
  onClose,
  token,
  companyId,
  companyName,
}: CompanyPaymentHistoryModalProps) {
  const toast = useToast();
  const [events, setEvents] = useState<StripePaymentEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .getCompanyPaymentEvents(token, companyId)
      .then((page) => {
        setEvents(page.events);
        setCursor(page.nextCursor);
      })
      .catch((error) => toast.error('Failed to load payment history: ' + (error as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, companyId]);

  const loadMore = async () => {
    if (!cursor) return;
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

  return (
    <Modal open={open} title={`${companyName} — Payment history`} onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <Link to={`/companies?open=${companyId}`} onClick={onClose} className="table-link text-sm self-start">
          View company profile →
        </Link>

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
          <button type="button" className="btn-secondary btn-sm self-start" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </Modal>
  );
}
