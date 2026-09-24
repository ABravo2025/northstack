import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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

// Key names, not translated strings — resolved through t() at render time (below) so a live
// language switch updates them, unlike a module-level object built once from i18n.t() at import.
const STATUS_LABEL_KEYS: Record<StripePaymentEvent['type'], string> = {
  charge_succeeded: 'companyPaymentHistory.statusLabels.charge_succeeded',
  charge_failed: 'companyPaymentHistory.statusLabels.charge_failed',
  charge_refunded: 'companyPaymentHistory.statusLabels.charge_refunded',
  charge_pending: 'companyPaymentHistory.statusLabels.charge_pending',
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
  const { t } = useTranslation('crm');
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
      .catch((error) => toast.error(t('companyPaymentHistory.toastLoadFailed', { error: (error as Error).message })))
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
      toast.error(t('companyPaymentHistory.toastLoadMoreFailed', { error: (error as Error).message }));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Modal open={open} title={t('companyPaymentHistory.title', { companyName })} onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <Link to={`/companies?open=${companyId}`} onClick={onClose} className="table-link text-sm self-start">
          {t('companyPaymentHistory.viewCompanyProfile')}
        </Link>

        {loading ? (
          <TableSkeleton rows={5} />
        ) : events.length === 0 ? (
          <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('companyPaymentHistory.noPayments')}</p>
        ) : (
          <>
          <div className="entity-card-list">
            {events.map((event) => (
              <div key={event.id} className="entity-card" style={{ alignItems: 'flex-start' }}>
                <span className="entity-card-body">
                  <span className="flex items-center justify-between gap-2">
                    <span className="entity-card-name">{formatMoney(event.amountCents, event.currency.toUpperCase())}</span>
                    <span className="entity-card-meta shrink-0">{new Date(event.createdAt).toLocaleDateString()}</span>
                  </span>
                  <span className="entity-card-meta">
                    {t(STATUS_LABEL_KEYS[event.type])}
                    {event.receiptUrl && (
                      <>
                        {' · '}
                        <a href={event.receiptUrl} target="_blank" rel="noreferrer" className="table-link">
                          {t('companyPaymentHistory.viewReceipt')}
                        </a>
                      </>
                    )}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <div className="full-table-wrap has-mobile-cards">
            <table className="table full-table">
              <thead>
                <tr>
                  <th>{t('companyPaymentHistory.columns.date')}</th>
                  <th>{t('companyPaymentHistory.columns.amount')}</th>
                  <th>{t('companyPaymentHistory.columns.status')}</th>
                  <th>{t('companyPaymentHistory.columns.receipt')}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{new Date(event.createdAt).toLocaleDateString()}</td>
                    <td>{formatMoney(event.amountCents, event.currency.toUpperCase())}</td>
                    <td>{t(STATUS_LABEL_KEYS[event.type])}</td>
                    <td>
                      {event.receiptUrl ? (
                        <a href={event.receiptUrl} target="_blank" rel="noreferrer" className="table-link">
                          {t('companyPaymentHistory.viewReceipt')}
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
          </>
        )}

        {cursor && (
          <button type="button" className="btn-secondary btn-sm self-start" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? t('common.loading') : t('companyPaymentHistory.loadMore')}
          </button>
        )}
      </div>
    </Modal>
  );
}
