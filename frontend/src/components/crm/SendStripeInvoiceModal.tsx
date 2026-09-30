import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, type SentStripeInvoice } from '../../api';
import Modal from '../common/Modal';
import { CURRENCY_CODES, formatMoney } from '../../lib/currencies';

interface SendStripeInvoiceModalProps {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  token: string;
  companyId: string;
  companyName: string;
  defaultCurrency: string;
}

interface LineDraft {
  key: number;
  description: string;
  amount: string;
}

const MAX_LINES = 20;

function newRequestId(): string {
  return crypto.randomUUID();
}

function toCents(amount: string): number {
  return Math.round(Number.parseFloat(amount) * 100);
}

// Payments v1 Unidad 8 — builds a Stripe-hosted invoice for a linked Company. Northstack creates,
// finalizes and emails it in one step (no draft editing here); Stripe's own hosted page handles
// the actual payment.
export default function SendStripeInvoiceModal({
  open,
  onClose,
  onSent,
  token,
  companyId,
  companyName,
  defaultCurrency,
}: SendStripeInvoiceModalProps) {
  const { t } = useTranslation('crm');
  const [currency, setCurrency] = useState(defaultCurrency.toUpperCase());
  const [lines, setLines] = useState<LineDraft[]>([{ key: 0, description: '', amount: '' }]);
  const [nextKey, setNextKey] = useState(1);
  const [daysUntilDue, setDaysUntilDue] = useState('30');
  const [memo, setMemo] = useState('');
  // One id per submit attempt: a double-click or network retry of the same attempt reaches Stripe
  // with the same idempotency keys (one invoice, not two). Regenerated after a failure, because
  // the server deletes the failed draft and a new attempt must not replay the old one.
  const [requestId, setRequestId] = useState(newRequestId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyPermissionError, setKeyPermissionError] = useState(false);
  const [sent, setSent] = useState<SentStripeInvoice | null>(null);

  const totalCents = lines.reduce((sum, line) => {
    const cents = toCents(line.amount);
    return Number.isFinite(cents) && cents > 0 ? sum + cents : sum;
  }, 0);

  const linesValid = lines.every((line) => line.description.trim() && toCents(line.amount) > 0);
  const days = Number.parseInt(daysUntilDue, 10);
  const daysValid = Number.isInteger(days) && days >= 0 && days <= 365;
  const canSubmit = linesValid && daysValid && !submitting;

  const updateLine = (key: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const addLine = () => {
    setLines((prev) => [...prev, { key: nextKey, description: '', amount: '' }]);
    setNextKey((k) => k + 1);
  };

  const removeLine = (key: number) => {
    setLines((prev) => prev.filter((line) => line.key !== key));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setKeyPermissionError(false);
    try {
      const result = await api.sendCompanyInvoice(token, companyId, {
        currency,
        lines: lines.map((line) => ({ description: line.description.trim(), amountCents: toCents(line.amount) })),
        daysUntilDue: days,
        memo: memo.trim() || undefined,
        requestId,
      });
      setSent(result);
      onSent();
    } catch (err) {
      setKeyPermissionError(err instanceof ApiError && err.field === 'stripe_key_permission');
      setError((err as Error).message);
      setRequestId(newRequestId());
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <Modal
        open={open}
        title={t('sendInvoice.sentTitle')}
        onClose={onClose}
        footer={
          <button type="button" className="btn-primary btn-md" onClick={onClose}>
            {t('sendInvoice.done')}
          </button>
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          <p>
            {sent.emailSent
              ? t('sendInvoice.sentBody', {
                  number: sent.number ?? sent.id,
                  amount: formatMoney(sent.amountDueCents, sent.currency.toUpperCase()),
                  companyName,
                })
              : t('sendInvoice.sentNoEmailBody', {
                  number: sent.number ?? sent.id,
                  amount: formatMoney(sent.amountDueCents, sent.currency.toUpperCase()),
                })}
          </p>
          <div className="flex flex-wrap gap-4">
            {sent.hostedInvoiceUrl && (
              <a href={sent.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="table-link">
                {t('sendInvoice.viewPaymentPage')}
              </a>
            )}
            <a href={sent.dashboardUrl} target="_blank" rel="noreferrer" className="table-link">
              {t('sendInvoice.viewInStripe')}
            </a>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      title={t('sendInvoice.title', { companyName })}
      onClose={onClose}
      wide
      footer={
        <button type="button" className="btn-primary btn-md" onClick={handleSubmit} disabled={!canSubmit}>
          {submitting
            ? t('sendInvoice.sending')
            : totalCents > 0
              ? t('sendInvoice.sendWithTotal', { total: formatMoney(totalCents, currency) })
              : t('sendInvoice.send')}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-xs text-ink-muted dark:text-dark-ink-muted">{t('sendInvoice.intro')}</p>

        {error && (
          <div className="field-error">
            {error}
            {keyPermissionError && (
              <>
                {' '}
                <a href="/settings/integrations" className="table-link">
                  {t('sendInvoice.openIntegrations')}
                </a>
              </>
            )}
          </div>
        )}

        <div className="form-group" style={{ marginBottom: 0 }}>
          <div className="grid items-center gap-2" style={{ gridTemplateColumns: 'minmax(0, 1fr) 6.5rem auto' }}>
            <label htmlFor="invoice-line-0-description">{t('sendInvoice.fields.description')}</label>
            <label htmlFor="invoice-line-0-amount">{t('sendInvoice.fields.amount')}</label>
            <span />
            {lines.map((line, index) => (
              <InvoiceLineRow
                key={line.key}
                index={index}
                line={line}
                canRemove={lines.length > 1}
                onChange={(patch) => updateLine(line.key, patch)}
                onRemove={() => removeLine(line.key)}
              />
            ))}
          </div>
          {lines.length < MAX_LINES && (
            <button type="button" className="table-link mt-2 self-start text-xs" onClick={addLine}>
              {t('sendInvoice.addLine')}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="invoice-currency">{t('sendInvoice.fields.currency')}</label>
            <select id="invoice-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="invoice-days-until-due">{t('sendInvoice.fields.daysUntilDue')}</label>
            <input
              id="invoice-days-until-due"
              type="number"
              min="0"
              max="365"
              step="1"
              style={{ width: '8rem' }}
              value={daysUntilDue}
              onChange={(e) => setDaysUntilDue(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label htmlFor="invoice-memo">{t('sendInvoice.fields.memo')}</label>
          <textarea
            id="invoice-memo"
            rows={2}
            maxLength={500}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={t('sendInvoice.memoPlaceholder')}
          />
        </div>
      </div>
    </Modal>
  );
}
function InvoiceLineRow({
  index,
  line,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  line: LineDraft;
  canRemove: boolean;
  onChange: (patch: Partial<LineDraft>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation('crm');
  return (
    <>
      <input
        id={`invoice-line-${index}-description`}
        type="text"
        value={line.description}
        maxLength={200}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder={t('sendInvoice.descriptionPlaceholder')}
        aria-label={`${t('sendInvoice.fields.description')} ${index + 1}`}
      />
      <input
        id={`invoice-line-${index}-amount`}
        type="number"
        min="0"
        step="0.01"
        value={line.amount}
        onChange={(e) => onChange({ amount: e.target.value })}
        placeholder="0.00"
        aria-label={`${t('sendInvoice.fields.amount')} ${index + 1}`}
      />
      {canRemove ? (
        <button type="button" className="table-link text-xs" onClick={onRemove}>
          {t('sendInvoice.removeLine')}
        </button>
      ) : (
        <span />
      )}
    </>
  );
}
