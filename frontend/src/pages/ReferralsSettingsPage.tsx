import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StatTile from '../components/metrics/StatTile';
import TableBody from '../components/common/TableBody';
import { CopyIcon, DownloadIcon } from '../components/common/Icons';
import { useToast } from '../components/common/ToastProvider';
import { ApiError } from '../api/http';
import {
  referralsApi,
  type CommissionStatus,
  type MyReferrals,
  type PayoutMethod,
  type ReferralMembership,
  type ReferralRules,
  type ReferralStatus,
} from '../api/referrals';

// Referral program (2026-10-04, mockup approved by Alejandro). Settings → My account → Referrals:
// joining (payout details first, then the terms), then the member's link, balances and history.

const METHODS: PayoutMethod[] = ['wise', 'payoneer', 'paypal', 'wire_intl', 'bank_ar'];

// Mirrors the backend's PAYOUT_FIELDS (referralService.ts) — [key, required, input type].
const FIELDS: Record<PayoutMethod, [string, boolean, string][]> = {
  wise: [['email', true, 'email'], ['holderName', true, 'text']],
  payoneer: [['email', true, 'email'], ['holderName', true, 'text']],
  paypal: [['email', true, 'email'], ['holderName', true, 'text']],
  wire_intl: [
    ['holderName', true, 'text'],
    ['holderAddress', true, 'text'],
    ['bankName', true, 'text'],
    ['bankCountry', true, 'text'],
  ],
  bank_ar: [['holderName', true, 'text'], ['taxId', true, 'text'], ['cbu', true, 'text'], ['alias', false, 'text']],
};

// Wire transfers, like Payroll's IBAN/ACH: the account fields depend on where the bank is.
type WireType = 'ach' | 'iban' | 'swift';
const WIRE_TYPES: WireType[] = ['ach', 'iban', 'swift'];
const WIRE_FIELDS: Record<WireType, [string, boolean, string][]> = {
  ach: [['routingNumber', true, 'text'], ['accountNumber', true, 'text']],
  iban: [['iban', true, 'text']],
  swift: [['swift', true, 'text'], ['accountNumber', true, 'text']],
};

function fieldsFor(method: PayoutMethod, values: Record<string, string>): [string, boolean, string][] {
  if (method !== 'wire_intl') return FIELDS[method];
  const wireType = values.wireType as WireType | undefined;
  return wireType && WIRE_FIELDS[wireType] ? [...WIRE_FIELDS[wireType], ...FIELDS.wire_intl] : FIELDS.wire_intl;
}

const STATUS_TONE: Record<ReferralStatus | CommissionStatus, string> = {
  trialing: 'bg-surface-2 text-ink-muted dark:bg-dark-raised dark:text-dark-ink-muted',
  no_payment: 'bg-surface-2 text-ink-muted dark:bg-dark-raised dark:text-dark-ink-muted',
  active: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  void: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  payable: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  paid: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
};

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function useFormatters() {
  const { i18n } = useTranslation();
  const locale = i18n.language === 'es' ? 'es-AR' : 'en-US';
  return useMemo(
    () => ({
      money: (cents: number, currency: string) =>
        new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'code' }).format(cents / 100),
      date: (value: string) => new Date(value).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
    }),
    [locale],
  );
}

export default function ReferralsSettingsPage({ token }: { token: string }) {
  const { t } = useTranslation('settingsPages');
  const [data, setData] = useState<MyReferrals | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    referralsApi
      .me(token)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [token]);

  if (error) return <div className="alert alert-error">{t('referrals.loadError', { message: error })}</div>;
  if (!data) return <div className="py-16 text-center text-sm text-ink-faint dark:text-dark-ink-faint">{t('referrals.loading')}</div>;

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      {data.member ? (
        <MemberView token={token} rules={data.rules} member={data.member} onChange={setData} />
      ) : (
        <JoinView token={token} rules={data.rules} onJoined={setData} />
      )}
    </div>
  );
}

// ---------- joining ----------

function PayoutFields({
  method,
  values,
  onChange,
  fieldError,
}: {
  method: PayoutMethod;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  fieldError: { field: string; message: string } | null;
}) {
  const { t } = useTranslation('settingsPages');
  const fields = fieldsFor(method, values);
  return (
    <>
    {method === 'wire_intl' && (
      <fieldset className="mt-4">
        <legend className="mb-1.5 text-sm font-medium">{t('referrals.fields.wireType')}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2" role="radiogroup">
          {WIRE_TYPES.map((wt) => (
            <label key={wt} className="flex items-center gap-2 text-sm" htmlFor={`wire-${wt}`}>
              <input id={`wire-${wt}`} type="radio" name="wireType" className="accent-accent" checked={values.wireType === wt} onChange={() => onChange({ ...values, wireType: wt })} />
              {t(`referrals.wireTypes.${wt}`)}
            </label>
          ))}
        </div>
        {fieldError?.field === 'wireType' && <div className="field-error">{fieldError.message}</div>}
      </fieldset>
    )}
    <div className="mt-4 grid gap-x-4 gap-y-3 sm:grid-cols-2">
      {fields.map(([key, required, type], i) => (
        <div key={key} className={`form-group m-0 min-w-0 ${fields.length % 2 === 1 && i === fields.length - 1 ? 'sm:col-span-2' : ''}`}>
          <label htmlFor={`payout-${key}`}>
            {t(`referrals.fields.${key}`)} {!required && <span className="text-ink-faint dark:text-dark-ink-faint">{t('referrals.fields.optional')}</span>}
          </label>
          <input
            id={`payout-${key}`}
            type={type}
            value={values[key] ?? ''}
            onChange={(e) => onChange({ ...values, [key]: e.target.value })}
            autoComplete="off"
            className="w-full"
          />
          {fieldError?.field === key && <div className="field-error">{fieldError.message}</div>}
        </div>
      ))}
    </div>
    </>
  );
}

function MethodPicker({ value, onChange }: { value: PayoutMethod; onChange: (m: PayoutMethod) => void }) {
  const { t } = useTranslation('settingsPages');
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2" role="radiogroup" aria-label={t('referrals.join.methodTitle')}>
      {METHODS.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          onClick={() => onChange(m)}
          className={`flex flex-col items-start rounded-lg border px-3 py-2.5 text-left ${
            value === m
              ? 'border-accent bg-accent-soft ring-1 ring-inset ring-accent'
              : 'border-line-strong bg-input hover:bg-surface-2 dark:border-dark-line dark:bg-dark-input dark:hover:bg-dark-raised'
          }`}
        >
          <span className="text-sm font-semibold">{t(`referrals.methods.${m}.label`)}</span>
          <span className="text-xs text-ink-faint dark:text-dark-ink-faint">{t(`referrals.methods.${m}.hint`)}</span>
        </button>
      ))}
    </div>
  );
}

function requiredFilled(method: PayoutMethod, values: Record<string, string>): boolean {
  if (method === 'wire_intl' && !values.wireType) return false;
  return fieldsFor(method, values).every(([key, required]) => !required || (values[key] ?? '').trim() !== '');
}

function ruleVars(rules: ReferralRules, money: (c: number, cur: string) => string) {
  return {
    percent: rules.commissionPercent,
    payments: rules.commissionPayments,
    holdDays: rules.holdDays,
    trialDays: rules.trialDays,
    minUsd: money(rules.minPayoutCents.USD ?? 0, 'USD'),
    minArs: money(rules.minPayoutCents.ARS ?? 0, 'ARS'),
  };
}

function JoinView({ token, rules, onJoined }: { token: string; rules: ReferralRules; onJoined: (d: MyReferrals) => void }) {
  const { t } = useTranslation('settingsPages');
  const toast = useToast();
  const { money } = useFormatters();
  const [method, setMethod] = useState<PayoutMethod>('wise');
  const [values, setValues] = useState<Record<string, string>>({});
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const vars = ruleVars(rules, money);
  const filled = requiredFilled(method, values);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!filled || !accepted) return;
    setBusy(true);
    setFieldError(null);
    try {
      const result = await referralsApi.join(token, { payoutMethod: method, payoutDetails: values, acceptTerms: true, termsVersion: rules.termsVersion });
      toast.success(t('referrals.join.joined'));
      onJoined(result);
    } catch (err) {
      if (err instanceof ApiError && err.field) setFieldError({ field: err.field, message: err.message });
      else toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div>
        <h2 className="text-xl font-semibold">{t('referrals.title')}</h2>
        <p className="mt-1 max-w-[65ch] text-sm text-ink-muted dark:text-dark-ink-muted">{t('referrals.intro', vars)}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {(['share', 'pay', 'transfer'] as const).map((step, i) => (
          <div key={step} className="rounded-lg border border-line bg-surface-1 p-4 dark:border-dark-line dark:bg-dark-surface">
            <span className="mb-2 inline-grid h-5 w-5 place-items-center rounded-full bg-accent-tint text-[11px] font-bold text-accent dark:text-brand-blue-light">{i + 1}</span>
            <p className="text-sm font-semibold">{t(`referrals.steps.${step}.title`, vars)}</p>
            <p className="text-xs text-ink-muted dark:text-dark-ink-muted">{t(`referrals.steps.${step}.body`, { ...vars, min: `${vars.minUsd} / ${vars.minArs}` })}</p>
          </div>
        ))}
      </div>

      <form className="card" onSubmit={submit} noValidate>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="card-title m-0">{t('referrals.join.methodTitle')}</h3>
          <span className="text-xs text-ink-faint dark:text-dark-ink-faint">{t('referrals.join.methodHint')}</span>
        </div>
        <MethodPicker value={method} onChange={(m) => { setMethod(m); setFieldError(null); }} />
        <PayoutFields method={method} values={values} onChange={setValues} fieldError={fieldError} />

        <div className="mt-5 max-h-44 overflow-auto rounded-lg border border-line bg-surface-2 px-4 py-3 text-xs text-ink-muted dark:border-dark-line dark:bg-dark-raised dark:text-dark-ink-muted" tabIndex={0}>
          <TermsList rules={rules} />
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm" htmlFor="referral-terms">
          <input
            id="referral-terms"
            type="checkbox"
            className="mt-1"
            checked={accepted && filled}
            disabled={!filled}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          <span>
            {t('referrals.join.accept')}{' '}
            <Link to="/referral-terms" target="_blank" className="font-medium text-accent hover:underline dark:text-brand-blue-light">
              {t('referrals.join.termsLink')}
            </Link>
          </span>
        </label>
        {!filled && <p className="mt-1 text-xs text-ink-faint dark:text-dark-ink-faint">{t('referrals.join.lockedHint')}</p>}
        {fieldError?.field === 'acceptTerms' && <div className="field-error">{fieldError.message}</div>}
        <div className="mt-4 flex justify-end">
          <button type="submit" className="btn-primary btn-md" disabled={!filled || !accepted || busy}>
            {t('referrals.join.submit')}
          </button>
        </div>
      </form>
    </>
  );
}

// onDark: on the always-navy auth panel (the public terms page).
export function TermsList({ rules, onDark = false }: { rules: ReferralRules; onDark?: boolean }) {
  const { t } = useTranslation('settingsPages');
  const { money } = useFormatters();
  const items = t('referrals.terms.items', { ...ruleVars(rules, money), returnObjects: true }) as string[];
  return (
    <>
      <p className={`font-semibold ${onDark ? 'text-brand-cream' : 'text-ink dark:text-dark-ink'}`}>
        {t('referrals.terms.title')} ({t('referrals.terms.version', { version: rules.termsVersion })})
      </p>
      <ol className={`mt-2 flex list-decimal flex-col gap-1 pl-5 ${onDark ? 'text-brand-blue-light/90' : ''}`}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </>
  );
}

// ---------- member ----------

type Tab = 'referrals' | 'commissions' | 'payouts';

function MemberView({ token, rules, member, onChange }: { token: string; rules: ReferralRules; member: ReferralMembership; onChange: (d: MyReferrals) => void }) {
  const { t } = useTranslation('settingsPages');
  const toast = useToast();
  const { money, date } = useFormatters();
  const [tab, setTab] = useState<Tab>('referrals');
  const [editing, setEditing] = useState(false);
  const link = `${window.location.origin}/register?ref=${member.code}`;
  const vars = ruleVars(rules, money);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t('referrals.link.copied'));
    } catch {
      const el = document.getElementById('referral-link');
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
      toast.success(t('referrals.link.selectToCopy'));
    }
  };

  const download = async (payoutId: string, fileName: string) => {
    try {
      const blob = await referralsApi.receipt(token, payoutId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // One set of tiles per currency the member has earned in (USD by default before any).
  const currencies = Object.keys(member.totals).length ? Object.keys(member.totals).sort((a, b) => (a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b))) : ['USD'];
  const sum = (key: 'payable' | 'pending' | 'paid') =>
    currencies.map((cur) => money(member.totals[cur]?.[key] ?? 0, cur)).join(' + ');
  const payableSubtitle = currencies
    .map((cur) => {
      const tot = member.totals[cur];
      if (!tot || tot.payable === 0) return null;
      return tot.ready ? t('referrals.totals.ready') : t('referrals.totals.missing', { amount: money(tot.minPayout - tot.payable, cur) });
    })
    .filter(Boolean)
    .join(' · ');

  const TABS: [Tab, string][] = [
    ['referrals', t('referrals.tabs.referrals')],
    ['commissions', t('referrals.tabs.commissions')],
    ['payouts', t('referrals.tabs.payouts')],
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t('referrals.title')}</h2>
          <p className="mt-1 text-sm text-ink-muted dark:text-dark-ink-muted">{t('referrals.introMember', vars)}</p>
        </div>
        <button type="button" className="btn-secondary btn-md" onClick={() => setEditing((v) => !v)}>
          {t('referrals.payout.current', { method: t(`referrals.methods.${member.payoutMethod}.label`), summary: member.payoutSummary })} · {t('referrals.payout.edit')}
        </button>
      </div>

      {editing && <EditPayout token={token} member={member} onSaved={(d) => { onChange(d); setEditing(false); }} onCancel={() => setEditing(false)} />}

      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="card-title m-0">{t('referrals.link.title')}</h3>
          <span className="text-xs text-ink-faint dark:text-dark-ink-faint">
            {t('referrals.link.code')} <strong className="tabular-nums text-ink dark:text-dark-ink">{member.code}</strong>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <code id="referral-link" className="min-w-0 flex-[1_1_280px] overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-line-strong bg-input px-3 py-2 text-xs dark:border-dark-line dark:bg-dark-input">
            {link}
          </code>
          <button type="button" className="btn-primary btn-md" onClick={copy}>
            <CopyIcon className="h-4 w-4" /> {t('referrals.link.copy')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <StatTile label={t('referrals.totals.payable')} value={sum('payable')} subtitle={payableSubtitle || t('referrals.totals.nothing')} />
        <StatTile label={t('referrals.totals.pending')} value={sum('pending')} subtitle={t('referrals.totals.pendingHint', { days: rules.holdDays })} />
        <StatTile label={t('referrals.totals.paid')} value={sum('paid')} subtitle={t('referrals.totals.transfers', { count: member.payouts.length })} />
        <StatTile label={t('referrals.totals.companies')} value={String(member.referrals.length)} />
      </div>

      <div className="card p-0">
        <div className="flex gap-1 overflow-x-auto border-b border-line px-2 dark:border-dark-line" role="tablist">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm ${tab === key ? 'border-accent font-semibold text-accent dark:text-brand-blue-light' : 'border-transparent text-ink-muted hover:text-ink dark:text-dark-ink-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          {tab === 'referrals' && (
            <table className="table w-full">
              <thead>
                <tr>
                  <th>{t('referrals.table.company')}</th>
                  <th>{t('referrals.table.signedUp')}</th>
                  <th>{t('referrals.table.status')}</th>
                  <th>{t('referrals.table.commissions')}</th>
                  <th className="text-right">{t('referrals.table.earned')}</th>
                </tr>
              </thead>
              <TableBody colSpan={5} isEmpty={member.referrals.length === 0} empty={{ title: t('referrals.table.emptyReferrals') }}>
                {member.referrals.map((r) => {
                  const earned = Object.entries(r.earned).map(([cur, e]) => money(e.payable + e.pending + e.paid, cur));
                  return (
                    <tr key={r.id}>
                      <td className="font-semibold">{r.companyName}</td>
                      <td className="tabular-nums">{date(r.createdAt)}</td>
                      <td><Pill tone={STATUS_TONE[r.status]}>{t(`referrals.referralStatus.${r.status}`)}</Pill></td>
                      <td>
                        <span className="mr-2 inline-flex gap-0.5 align-middle" aria-hidden="true">
                          {Array.from({ length: rules.commissionPayments }, (_, i) => (
                            <span key={i} className={`h-2 w-2 rounded-sm ${i < r.commissionCount ? 'bg-accent' : 'bg-line-strong dark:bg-dark-line'}`} />
                          ))}
                        </span>
                        {t('referrals.table.ofTotal', { n: r.commissionCount, total: rules.commissionPayments })}
                      </td>
                      <td className="text-right tabular-nums">{earned.length ? earned.join(' + ') : '—'}</td>
                    </tr>
                  );
                })}
              </TableBody>
            </table>
          )}

          {tab === 'commissions' && (
            <table className="table w-full">
              <thead>
                <tr>
                  <th>{t('referrals.table.company')}</th>
                  <th>{t('referrals.table.payment')}</th>
                  <th className="text-right">{t('referrals.table.paymentAmount')}</th>
                  <th className="text-right">{t('referrals.table.yourShare', { percent: rules.commissionPercent })}</th>
                  <th>{t('referrals.table.payableOn')}</th>
                  <th>{t('referrals.table.status')}</th>
                </tr>
              </thead>
              <TableBody colSpan={6} isEmpty={member.commissions.length === 0} empty={{ title: t('referrals.table.emptyCommissions') }}>
                {member.commissions.map((c) => (
                  <tr key={c.id}>
                    <td>{c.companyName}</td>
                    <td>{t('referrals.table.ofTotal', { n: c.paymentNumber, total: rules.commissionPayments })}</td>
                    <td className="text-right tabular-nums">{money(c.paymentCents, c.currency)}</td>
                    <td className="text-right tabular-nums">{money(c.commissionCents, c.currency)}</td>
                    <td className="tabular-nums">{c.status === 'void' ? '—' : date(c.dueAt)}</td>
                    <td title={c.voidReason ?? undefined}>
                      <Pill tone={STATUS_TONE[c.status]}>{t(`referrals.commissionStatus.${c.status}`, { number: c.payout?.number ?? '' })}</Pill>
                    </td>
                  </tr>
                ))}
              </TableBody>
            </table>
          )}

          {tab === 'payouts' && (
            <table className="table w-full">
              <thead>
                <tr>
                  <th>{t('referrals.table.transfer')}</th>
                  <th>{t('referrals.table.date')}</th>
                  <th>{t('referrals.table.method')}</th>
                  <th>{t('referrals.table.reference')}</th>
                  <th className="text-right">{t('referrals.table.amount')}</th>
                  <th>{t('referrals.table.receipt')}</th>
                </tr>
              </thead>
              <TableBody colSpan={6} isEmpty={member.payouts.length === 0} empty={{ title: t('referrals.table.emptyPayouts') }}>
                {member.payouts.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="font-semibold">{p.number}</div>
                      <div className="text-xs text-ink-faint dark:text-dark-ink-faint">{t('referrals.table.commissionsCount', { count: p.commissionCount })}</div>
                    </td>
                    <td className="tabular-nums">{date(p.transferredAt)}</td>
                    <td>{t(`referrals.methods.${p.payoutMethod}.label`)}</td>
                    <td className="tabular-nums">{p.reference ?? '—'}</td>
                    <td className="text-right font-semibold tabular-nums">{money(p.amountCents, p.currency)}</td>
                    <td>
                      <button type="button" className="btn-secondary btn-sm" onClick={() => download(p.id, p.receiptFileName)}>
                        <DownloadIcon className="h-3.5 w-3.5" /> {t('referrals.table.download')}
                      </button>
                    </td>
                  </tr>
                ))}
              </TableBody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function EditPayout({ token, member, onSaved, onCancel }: { token: string; member: ReferralMembership; onSaved: (d: MyReferrals) => void; onCancel: () => void }) {
  const { t } = useTranslation('settingsPages');
  const toast = useToast();
  const [method, setMethod] = useState<PayoutMethod>(member.payoutMethod);
  const [values, setValues] = useState<Record<string, string>>(member.payoutDetails);
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFieldError(null);
    try {
      const result = await referralsApi.updatePayoutDetails(token, { payoutMethod: method, payoutDetails: values });
      toast.success(t('referrals.payout.saved'));
      onSaved(result);
    } catch (err) {
      if (err instanceof ApiError && err.field) setFieldError({ field: err.field, message: err.message });
      else toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={save} noValidate>
      <h3 className="card-title mb-3">{t('referrals.payout.editTitle')}</h3>
      <MethodPicker value={method} onChange={(m) => { setMethod(m); setFieldError(null); }} />
      <PayoutFields method={method} values={values} onChange={setValues} fieldError={fieldError} />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn-secondary btn-md" onClick={onCancel}>{t('referrals.payout.cancel')}</button>
        <button type="submit" className="btn-primary btn-md" disabled={busy || !requiredFilled(method, values)}>{t('referrals.payout.save')}</button>
      </div>
    </form>
  );
}
