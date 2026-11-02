import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type CompanyProductsView, type Product } from '../../../api';
import { formatMoney } from '../../../lib/currencies';
import { useToast } from '../../common/ToastProvider';
import { parseAmountInput } from '../../../pages/leads/leadMoney';

// Clientes C4: what the company has from the catalog, its monthly recurring revenue, and the
// catalog products it doesn't have yet (white space — where an upsell could come from).
export default function CompanyProductsTab({ token, companyId, canManage }: { token: string; companyId: string; canManage: boolean }) {
  const { t, i18n } = useTranslation('crm');
  const toast = useToast();
  const [data, setData] = useState<CompanyProductsView | null>(null);
  const [adding, setAdding] = useState<Product | null>(null);
  const [form, setForm] = useState({ quantity: '1', price: '', renewalDate: '' });

  const load = useCallback(() => {
    api
      .getCompanyProducts(token, companyId)
      .then(setData)
      .catch((e) => toast.error((e as Error).message));
  }, [token, companyId, toast]);
  useEffect(load, [load]);

  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

  const startAdd = (p: Product) => {
    setAdding(p);
    setForm({ quantity: '1', price: String(p.unitPriceCents / 100), renewalDate: '' });
  };

  const add = async () => {
    if (!adding) return;
    try {
      await api.addCompanyProduct(token, companyId, {
        productId: adding.id,
        quantity: Math.max(1, Number.parseInt(form.quantity, 10) || 1),
        unitPriceCents: parseAmountInput(form.price) ?? adding.unitPriceCents,
        renewalDate: form.renewalDate || null,
      });
      setAdding(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const toggleCancel = async (lineId: string, cancelled: boolean) => {
    try {
      await api.updateCompanyProduct(token, companyId, lineId, { cancelled });
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!data) return <div className="overview-panel-left text-sm text-ink-muted dark:text-dark-ink-muted">{t('company360.loading')}</div>;

  return (
    <div className="overview-panel-left">
      <div className="field-group">
        <h4 className="field-group-title">{t('company360.products.title')}</h4>
        <p className="m-0 text-sm">
          {data.mrr.length
            ? t('company360.products.mrr', { amount: data.mrr.map((m) => formatMoney(m.cents, m.currency)).join(' + ') })
            : t('company360.products.noMrr')}
        </p>
        {data.lines.length === 0 ? (
          <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('company360.products.none')}</p>
        ) : (
          <ul className="ex-due mt-2">
            {data.lines.map((l) => (
              <li key={l.id} className={l.cancelledAt ? 'opacity-60' : ''}>
                <span className="flex min-w-0 flex-col">
                  <strong className="truncate">
                    {l.product.name}
                    {l.quantity > 1 ? ` × ${l.quantity}` : ''}
                  </strong>
                  <span className="ex-muted text-xs">
                    {formatMoney(l.unitPriceCents, l.product.currency)} · {t(`company360.billing.${l.product.billing}`)} · {t('company360.products.since', { date: date(l.startDate) })}
                    {l.renewalDate ? ` · ${t('company360.products.renews', { date: date(l.renewalDate) })}` : ''}
                    {l.cancelledAt ? ` · ${t('company360.products.cancelled')}` : ''}
                  </span>
                </span>
                {canManage && (
                  <button type="button" className="btn-secondary btn-sm" onClick={() => toggleCancel(l.id, !l.cancelledAt)}>
                    {l.cancelledAt ? t('company360.products.reactivate') : t('company360.products.cancel')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="field-group border-b-0">
        <h4 className="field-group-title">{t('company360.products.whiteSpace')}</h4>
        <p className="m-0 mb-2 text-xs text-ink-muted dark:text-dark-ink-muted">{t('company360.products.whiteSpaceHint')}</p>
        {data.whiteSpace.length === 0 ? (
          <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('company360.products.allOwned')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.whiteSpace.map((p) =>
              canManage ? (
                <button key={p.id} type="button" className="ex-option" onClick={() => startAdd(p)}>
                  + {p.name}
                </button>
              ) : (
                <span key={p.id} className="role-chip chip-neutral">
                  {p.name}
                </span>
              ),
            )}
          </div>
        )}
        {adding && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-line p-3 dark:border-dark-line">
            <strong className="text-sm">{t('company360.products.addTitle', { name: adding.name })}</strong>
            <div className="ex-filters">
              <label className="ex-field">
                {t('company360.products.quantity')}
                <input type="number" min={1} className="w-20" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </label>
              <label className="ex-field">
                {t('company360.products.price', { currency: adding.currency })}
                <input inputMode="decimal" className="w-32" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </label>
              <label className="ex-field">
                {t('company360.products.renewal')}
                <input type="date" value={form.renewalDate} onChange={(e) => setForm({ ...form, renewalDate: e.target.value })} />
              </label>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => setAdding(null)}>
                {t('company360.cancel')}
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={add}>
                {t('company360.products.add')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
