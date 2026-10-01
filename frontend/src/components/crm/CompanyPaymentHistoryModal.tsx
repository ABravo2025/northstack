import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../api';
import type { CompanyStripeInvoice, StripePaymentEvent } from '../../api';
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

// The full, paginated invoices + payments history of one company. Lives inline in the company's
// own "Payments" tab (CompanyDetailModal, 2026-10) and inside CompanyPaymentHistoryModal below,
// which PaymentsOverviewPage still opens from its Company link.
export function CompanyPaymentHistory({ token, companyId }: { token: string; companyId: string }) {
  const { t } = useTranslation('crm');
  const toast = useToast();
  const [events, setEvents] = useState<StripePaymentEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
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
  }, [companyId]);

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
      <div className="flex flex-col gap-3">
        <CompanyInvoicesSection token={token} companyId={companyId} />

        <h4 className="text-sm font-medium">{t('companyPaymentHistory.paymentsHeading')}</h4>
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
  );
}

// Reached from PaymentsOverviewPage's Company link: the same history in a Modal, plus a way into
// the company's profile.
export default function CompanyPaymentHistoryModal({ open, onClose, token, companyId, companyName }: CompanyPaymentHistoryModalProps) {
  const { t } = useTranslation('crm');
  return (
    <Modal open={open} title={t('companyPaymentHistory.title', { companyName })} onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <Link to={`/companies?open=${companyId}`} onClick={onClose} className="table-link text-sm self-start">
          {t('companyPaymentHistory.viewCompanyProfile')}
        </Link>
        {open && <CompanyPaymentHistory token={token} companyId={companyId} />}
      </div>
    </Modal>
  );
}

function invoiceStatusChip(invoice: CompanyStripeInvoice): { labelKey: string; className: string } {
  if (invoice.status === 'paid') return { labelKey: 'companyInvoices.status.paid', className: 'role-chip chip-good' };
  if (invoice.status === 'open') {
    const overdue = invoice.dueDate !== null && new Date(invoice.dueDate).getTime() < Date.now();
    return overdue
      ? { labelKey: 'companyInvoices.status.overdue', className: 'category-chip chip-coral' }
      : { labelKey: 'companyInvoices.status.open', className: 'role-chip chip-blue' };
  }
  if (invoice.status === 'uncollectible') return { labelKey: 'companyInvoices.status.uncollectible', className: 'role-chip chip-neutral' };
  return { labelKey: 'companyInvoices.status.void', className: 'role-chip chip-neutral' };
}

// Payments v1 Unidad 8 — an unpaid invoice has no Charge yet, so it never appears in the payments
// list below; this is where it becomes visible. Loads independently of the payments list, and a
// key without Invoices access degrades to a one-line note instead of an error toast.
function CompanyInvoicesSection({ token, companyId }: { token: string; companyId: string }) {
  const { t } = useTranslation('crm');
  const toast = useToast();
  const [invoices, setInvoices] = useState<CompanyStripeInvoice[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [noAccess, setNoAccess] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .getCompanyInvoices(token, companyId)
      .then((page) => {
        setInvoices(page.invoices);
        setCursor(page.nextCursor);
      })
      .catch((error) => {
        if (error instanceof ApiError && error.field === 'stripe_key_permission') {
          setNoAccess(true);
          return;
        }
        toast.error(t('companyInvoices.toastLoadFailed', { error: (error as Error).message }));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.getCompanyInvoices(token, companyId, cursor);
      setInvoices((prev) => [...prev, ...page.invoices]);
      setCursor(page.nextCursor);
    } catch (error) {
      toast.error(t('companyInvoices.toastLoadFailed', { error: (error as Error).message }));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-medium">{t('companyInvoices.heading')}</h4>
      {loading ? (
        <TableSkeleton rows={2} />
      ) : noAccess ? (
        <p className="text-xs text-ink-muted dark:text-dark-ink-muted">{t('companyInvoices.noAccess')}</p>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('companyInvoices.empty')}</p>
      ) : (
        <div className="entity-card-list" style={{ display: 'flex' }}>
          {invoices.map((invoice) => {
            const chip = invoiceStatusChip(invoice);
            return (
              <div key={invoice.id} className="entity-card" style={{ alignItems: 'flex-start' }}>
                <span className="entity-card-body">
                  <span className="flex items-center justify-between gap-2">
                    <span className="entity-card-name">
                      {invoice.number ?? invoice.id} · {formatMoney(invoice.amountDueCents, invoice.currency.toUpperCase())}
                    </span>
                    <span className={chip.className}>{t(chip.labelKey)}</span>
                  </span>
                  <span className="entity-card-meta" style={{ whiteSpace: 'normal' }}>
                    {invoice.dueDate
                      ? t('companyInvoices.due', { date: new Date(invoice.dueDate).toLocaleDateString() })
                      : new Date(invoice.createdAt).toLocaleDateString()}
                    {invoice.sentFromNorthstack && <> · {t('companyInvoices.sentFromNorthstack')}</>}
                    {invoice.hostedInvoiceUrl && (
                      <>
                        {' · '}
                        <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="table-link">
                          {t('companyInvoices.paymentPage')}
                        </a>
                      </>
                    )}
                    {' · '}
                    <a href={invoice.dashboardUrl} target="_blank" rel="noreferrer" className="table-link">
                      {t('companyInvoices.viewInStripe')}
                    </a>
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
      {cursor && (
        <button type="button" className="btn-secondary btn-sm self-start" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? t('common.loading') : t('companyInvoices.loadMore')}
        </button>
      )}
    </div>
  );
}
