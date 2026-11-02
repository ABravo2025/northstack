import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Product, type ProductBilling } from '../api';
import Modal from '../components/common/Modal';
import RequiredMark from '../components/common/RequiredMark';
import TableBody from '../components/common/TableBody';
import TableSkeleton from '../components/common/TableSkeleton';
import { useToast } from '../components/common/ToastProvider';
import { formatMoney } from '../lib/currencies';
import { parseAmountInput } from './leads/leadMoney';

// Clientes C4: Settings → Products — the catalog of what the company sells. Used on each client's
// 360 view (what they have, what they don't yet) and, later, for quotes (D3).
const BILLINGS: ProductBilling[] = ['monthly', 'yearly', 'one_time'];

export default function ProductsSettingsPage({ token }: { token: string }) {
  const { t } = useTranslation('crm');
  const toast = useToast();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);

  const load = useCallback(() => {
    api
      .listProducts(token)
      .then(setProducts)
      .catch((e) => toast.error((e as Error).message));
  }, [token, toast]);
  useEffect(load, [load]);

  return (
    <div>
      <div className="mb-3">
        <h3 className="card-title mb-1">{t('productsCatalog.title')}</h3>
        <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('productsCatalog.subtitle')}</p>
      </div>
      {products === null ? (
        <TableSkeleton rows={4} />
      ) : (
        <div className="full-table-wrap">
          <table className="table full-table to-table">
            <thead>
              <tr>
                <th>{t('productsCatalog.columns.name')}</th>
                <th>{t('productsCatalog.columns.billing')}</th>
                <th className="text-right">{t('productsCatalog.columns.price')}</th>
                <th className="text-right">{t('productsCatalog.columns.clients')}</th>
                <th>{t('productsCatalog.columns.status')}</th>
              </tr>
            </thead>
            <TableBody colSpan={5} isEmpty={products.length === 0} empty={{ title: t('productsCatalog.empty') }} onAdd={() => setEditing('new')} addLabel={t('productsCatalog.add')}>
              {products.map((p) => (
                <tr key={p.id} className={`cursor-pointer ${p.isActive ? '' : 'opacity-60'}`} onClick={() => setEditing(p)}>
                  <td className="!whitespace-normal">
                    <span className="flex flex-col">
                      <strong>{p.name}</strong>
                      {p.sku && <span className="ex-muted text-xs">{p.sku}</span>}
                    </span>
                  </td>
                  <td>{t(`company360.billing.${p.billing}`)}</td>
                  <td className="num text-right">{formatMoney(p.unitPriceCents, p.currency)}</td>
                  <td className="num text-right">{p.activeAccounts ?? 0}</td>
                  <td>
                    <span className={`to-chip ${p.isActive ? 'to-chip-approved' : 'to-chip-cancelled'}`}>{p.isActive ? t('productsCatalog.active') : t('productsCatalog.archived')}</span>
                  </td>
                </tr>
              ))}
            </TableBody>
          </table>
        </div>
      )}
      {editing && (
        <ProductModal
          token={token}
          product={editing === 'new' ? null : editing}
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

function ProductModal({ token, product, onClose, onSaved }: { token: string; product: Product | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation('crm');
  const toast = useToast();
  const [form, setForm] = useState({
    name: product?.name ?? '',
    sku: product?.sku ?? '',
    description: product?.description ?? '',
    price: product ? String(product.unitPriceCents / 100) : '',
    currency: product?.currency ?? '',
    billing: product?.billing ?? ('monthly' as ProductBilling),
    isActive: product?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const cents = parseAmountInput(form.price);
    if (cents === null) {
      toast.error(t('productsCatalog.invalidPrice'));
      return;
    }
    setSaving(true);
    const body = {
      name: form.name,
      sku: form.sku || null,
      description: form.description || null,
      unitPriceCents: cents,
      billing: form.billing,
      ...(form.currency.trim() ? { currency: form.currency.trim().toUpperCase() } : {}),
      ...(product ? { isActive: form.isActive } : {}),
    };
    try {
      if (product) await api.updateProduct(token, product.id, body);
      else await api.createProduct(token, body);
      toast.success(t('productsCatalog.saved'));
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={product ? product.name : t('productsCatalog.add')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('company360.cancel')}
          </button>
          <button type="submit" form="product-form" className="btn-primary" disabled={saving}>
            {t('productsCatalog.save')}
          </button>
        </>
      }
    >
      <form id="product-form" className="flex flex-col gap-3" onSubmit={submit}>
        <label className="ex-field">
          <span>
            {t('productsCatalog.columns.name')}
            <RequiredMark />
          </span>
          <input required maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="ex-field">
            <span>
              {t('productsCatalog.columns.price')}
              <RequiredMark />
            </span>
            <input required inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </label>
          <label className="ex-field">
            {t('productsCatalog.currency')}
            <input maxLength={3} placeholder={product?.currency ?? 'USD'} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </label>
          <label className="ex-field">
            {t('productsCatalog.columns.billing')}
            <select value={form.billing} onChange={(e) => setForm({ ...form, billing: e.target.value as ProductBilling })}>
              {BILLINGS.map((b) => (
                <option key={b} value={b}>
                  {t(`company360.billing.${b}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="ex-field">
          {t('productsCatalog.sku')}
          <input maxLength={60} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        </label>
        <label className="ex-field">
          {t('productsCatalog.description')}
          <textarea rows={3} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        {product && (
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            {t('productsCatalog.activeHint')}
          </label>
        )}
      </form>
    </Modal>
  );
}
