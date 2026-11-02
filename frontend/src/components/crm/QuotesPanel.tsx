import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Opportunity, type Product, type Quote, type QuoteLineInput } from '../../api';
import { formatMoney } from '../../lib/currencies';
import { parseAmountInput } from '../../pages/leads/leadMoney';
import Modal from '../common/Modal';
import { TrashIcon } from '../common/Icons';
import { useToast } from '../common/ToastProvider';

// Cruces D3: the deal's quotes — build one from the catalog, download the PDF, send the link. When
// the client accepts on the link, the deal moves to Won by itself.
const STATUS_CHIP = { draft: 'to-chip-cancelled', sent: 'to-chip-pending', accepted: 'to-chip-approved', declined: 'to-chip-rejected' } as const;

export default function QuotesPanel({ token, opportunity, canManage }: { token: string; opportunity: Opportunity; canManage: boolean }) {
  const { t, i18n } = useTranslation('crm');
  const toast = useToast();
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [editing, setEditing] = useState<Quote | 'new' | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listQuotes(token, opportunity.id).then(setQuotes).catch(() => setQuotes([]));
  }, [token, opportunity.id]);
  useEffect(load, [load]);

  const pdf = async (q: Quote) => {
    try {
      const blob = await api.downloadQuotePdf(token, q.id, i18n.language.startsWith('es') ? 'es' : 'en');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${t('quotes.fileName')}-${q.number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const send = async (q: Quote) => {
    try {
      const r = await api.sendQuote(token, q.id);
      setLink(r.url);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (quotes === null) return null;
  return (
    <div className="mx-4 mb-3 rounded-lg border border-line px-3 py-2.5 dark:border-dark-line">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-sm">{t('quotes.title')}</strong>
        {canManage && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing('new')}>
            + {t('quotes.new')}
          </button>
        )}
      </div>
      {quotes.length === 0 ? (
        <p className="m-0 mt-1 text-xs text-ink-muted dark:text-dark-ink-muted">{t('quotes.empty')}</p>
      ) : (
        <ul className="ex-due mt-1">
          {quotes.map((q) => (
            <li key={q.id}>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm">
                  #{q.number} · <span className="num">{formatMoney(q.totalCents, q.currency)}</span>{' '}
                  <span className={`to-chip ${STATUS_CHIP[q.status]}`}>{t(`quotes.status.${q.status}`)}</span>
                </span>
                <span className="ex-muted text-xs">
                  {q.status === 'accepted' && q.acceptedName ? t('quotes.acceptedBy', { name: q.acceptedName }) : q.status === 'declined' && q.declineReason ? q.declineReason : t('quotes.validUntil', { date: q.validUntil.slice(0, 10) })}
                </span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                <button type="button" className="btn-secondary btn-sm" onClick={() => pdf(q)}>
                  PDF
                </button>
                {canManage && q.status === 'draft' && (
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(q)}>
                    {t('quotes.edit')}
                  </button>
                )}
                {canManage && (q.status === 'draft' || q.status === 'sent') && (
                  <button type="button" className="btn-primary btn-sm" onClick={() => send(q)}>
                    {q.status === 'draft' ? t('quotes.send') : t('quotes.newLink')}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {link && (
        <div className="mt-2 flex flex-col gap-1.5 rounded-lg bg-accent/5 p-2.5 dark:bg-brand-blue-light/10">
          <span className="text-xs">{t('quotes.linkHint')}</span>
          <div className="flex gap-2">
            <input readOnly value={link} className="min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.target.select()} />
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() =>
                navigator.clipboard.writeText(link).then(
                  () => toast.success(t('quotes.copied')),
                  () => toast.error(t('quotes.copyFailed')),
                )
              }
            >
              {t('quotes.copy')}
            </button>
          </div>
        </div>
      )}
      {editing && (
        <QuoteEditor
          token={token}
          opportunity={opportunity}
          quote={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

type Row = { productId: string | null; name: string; quantity: string; price: string };

function QuoteEditor({ token, opportunity, quote, onClose, onSaved }: { token: string; opportunity: Opportunity; quote: Quote | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation('crm');
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [rows, setRows] = useState<Row[]>(
    quote ? quote.lines.map((l) => ({ productId: l.productId, name: l.name, quantity: String(l.quantity), price: String(l.unitPriceCents / 100) })) : [],
  );
  const [discount, setDiscount] = useState(String(quote?.discountPct ?? 0));
  const [notes, setNotes] = useState(quote?.notes ?? '');
  const [validDays, setValidDays] = useState('15');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listProducts(token).then((ps) => setProducts(ps.filter((p) => p.isActive))).catch(() => setProducts([]));
  }, [token]);

  const subtotal = rows.reduce((a, r) => a + (parseAmountInput(r.price) ?? 0) * (Number.parseInt(r.quantity, 10) || 0), 0);
  const pct = Math.min(Math.max(Number(discount) || 0, 0), 100);
  const total = Math.round(subtotal * (1 - pct / 100));
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    const lines: QuoteLineInput[] = rows.map((r) => ({
      productId: r.productId,
      name: r.name,
      quantity: Math.max(1, Number.parseInt(r.quantity, 10) || 1),
      unitPriceCents: parseAmountInput(r.price),
    }));
    try {
      if (quote) await api.updateQuote(token, quote.id, { lines, discountPct: pct, notes: notes || null, validDays: Number(validDays) || 15 });
      else await api.createQuote(token, { opportunityId: opportunity.id, lines, discountPct: pct, notes: notes || null, validDays: Number(validDays) || 15 });
      toast.success(t('quotes.saved'));
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      wide
      title={quote ? t('quotes.editTitle', { number: quote.number }) : t('quotes.new')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('quotes.cancel')}
          </button>
          <button type="button" className="btn-primary" disabled={saving || rows.length === 0} onClick={save}>
            {t('quotes.saveDraft')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="ex-field grow">
              {t('quotes.item')}
              <input value={r.name} maxLength={200} disabled={!!r.productId} onChange={(e) => set(i, { name: e.target.value })} />
            </label>
            <label className="ex-field">
              {t('quotes.qty')}
              <input type="number" min={1} className="w-20" value={r.quantity} onChange={(e) => set(i, { quantity: e.target.value })} />
            </label>
            <label className="ex-field">
              {t('quotes.price', { currency: opportunity.currency })}
              <input inputMode="decimal" className="w-32" value={r.price} onChange={(e) => set(i, { price: e.target.value })} />
            </label>
            <button type="button" className="icon-btn mb-1" aria-label={t('quotes.remove')} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="max-w-72"
            value=""
            aria-label={t('quotes.addProduct')}
            onChange={(e) => {
              const p = products.find((x) => x.id === e.target.value);
              if (p) setRows([...rows, { productId: p.id, name: p.name, quantity: '1', price: String(p.unitPriceCents / 100) }]);
            }}
          >
            <option value="">{t('quotes.addProduct')}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatMoney(p.unitPriceCents, p.currency)}
              </option>
            ))}
          </select>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setRows([...rows, { productId: null, name: '', quantity: '1', price: '' }])}>
            + {t('quotes.freeLine')}
          </button>
        </div>
        <div className="ex-filters">
          <label className="ex-field">
            {t('quotes.discount')}
            <input type="number" min={0} max={100} className="w-20" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </label>
          <label className="ex-field">
            {t('quotes.validDays')}
            <input type="number" min={1} max={365} className="w-20" value={validDays} onChange={(e) => setValidDays(e.target.value)} />
          </label>
          <span className="ml-auto text-sm">
            {t('quotes.total')}: <strong className="num">{formatMoney(total, opportunity.currency)}</strong>
          </span>
        </div>
        <label className="ex-field">
          {t('quotes.notes')}
          <textarea rows={3} maxLength={3000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <p className="ex-hint">{t('quotes.howItWorks')}</p>
      </div>
    </Modal>
  );
}
