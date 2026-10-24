import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { PaymentMethodCatalog, PaymentMethodKind } from '../../api';
import ConfirmDialog from '../common/ConfirmDialog';
import { useToast } from '../common/ToastProvider';
import { countryCode } from '../../lib/countries';

// Settings → Payroll → Payment methods (spec-payroll-v2.md, unit 4): every known method with a
// switch, what it asks the person for and how many people are paid with it, plus the company's own
// methods. Turning off one that people use asks first.
const LOGO: Record<PaymentMethodKind, { text: string; color: string }> = {
  bank_ar: { text: 'CBU', color: '#0f5e57' },
  mercadopago: { text: 'MP', color: '#0090d6' },
  bank_intl: { text: 'IBAN', color: '#5f5a78' },
  wise: { text: 'W', color: '#2f7d32' },
  payoneer: { text: 'P', color: '#d94f1e' },
  paypal: { text: 'PP', color: '#1d4ed8' },
  cash: { text: '$', color: '#a15c07' },
  other: { text: '•', color: '#5b21e6' },
};

interface Props {
  token: string;
  canManage: boolean;
  // Adds a custom method (the existing "Add payment method" dialog).
  onAddCustom: () => void;
  // Turns a custom method on/off (the existing handler); the grid reloads after.
  onToggleCustom: (id: string, active: boolean) => Promise<void>;
  version: number;
}

export default function PaymentMethodsGrid({ token, canManage, onAddCustom, onToggleCustom, version }: Props) {
  const { t } = useTranslation('hr');
  const toast = useToast();
  const [catalog, setCatalog] = useState<PaymentMethodCatalog | null>(null);
  const [confirmOff, setConfirmOff] = useState<PaymentMethodCatalog['items'][number] | null>(null);

  useEffect(() => {
    api
      .getPaymentMethodCatalog(token)
      .then(setCatalog)
      .catch((e) => toast.error((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, version]);

  if (!catalog) return null;

  const apply = async (item: PaymentMethodCatalog['items'][number], active: boolean) => {
    try {
      if (item.kind === 'other' && item.id) {
        await onToggleCustom(item.id, active);
        setCatalog(await api.getPaymentMethodCatalog(token));
      } else {
        setCatalog(await api.setKnownPaymentMethod(token, item.kind, active));
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const toggle = (item: PaymentMethodCatalog['items'][number]) => {
    if (item.active && item.people > 0) setConfirmOff(item);
    else void apply(item, !item.active);
  };
  const label = (item: PaymentMethodCatalog['items'][number]) => (item.kind === 'other' ? item.name : t(`payroll.methods.kinds.${item.kind}`));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.items.map((item) => (
          <div key={item.id ?? item.kind} className={`card !p-3 flex flex-col gap-1.5 ${item.active ? '' : 'opacity-60'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2.5 font-semibold">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white" style={{ background: LOGO[item.kind].color }} aria-hidden="true">
                  {LOGO[item.kind].text}
                </span>
                <span className="truncate">{label(item)}</span>
              </span>
              <label className="rules-switch !m-0" title={item.active ? t('payroll.methods.turnOff') : t('payroll.methods.turnOn')}>
                <input type="checkbox" checked={item.active} disabled={!canManage} onChange={() => toggle(item)} aria-label={label(item)} />
              </label>
            </div>
            <span className="text-xs text-ink-muted dark:text-dark-ink-muted">
              {t(`payroll.methods.asks.${item.asks}`)} · {item.people ? t('payroll.methods.people', { count: item.people }) : t('payroll.methods.nobody')}
            </span>
          </div>
        ))}
        {canManage && (
          <button type="button" className="card !p-3 border-dashed text-sm font-semibold text-accent dark:text-brand-blue-light" onClick={onAddCustom}>
            + {t('payroll.methods.addOther')}
          </button>
        )}
      </div>
      <p className="rules-hint m-0">{t(`payroll.methods.hint${countryCode(catalog.country) === 'AR' ? 'Ar' : 'Other'}`)}</p>
      {confirmOff && (
        <ConfirmDialog
          title={t('payroll.methods.offTitle', { name: label(confirmOff) })}
          message={t('payroll.methods.offBody', { count: confirmOff.people })}
          confirmLabel={t('payroll.methods.turnOff')}
          onCancel={() => setConfirmOff(null)}
          onConfirm={() => {
            const item = confirmOff;
            setConfirmOff(null);
            void apply(item, false);
          }}
        />
      )}
    </div>
  );
}
