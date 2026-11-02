import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  api,
  type ExpenseAccount,
  type ExpenseImportRowInput,
  type ExpenseImportRowPlan,
  type ExpenseImportStatus,
  type ExpensesMeta,
} from '../../api';
import { UploadIcon } from '../../components/common/Icons';
import TableSkeleton from '../../components/common/TableSkeleton';
import { useToast } from '../../components/common/ToastProvider';
import {
  CONVENTIONS,
  detectConvention,
  guessColumns,
  guessDateFormat,
  guessNumberFormat,
  normalizeRow,
  parseCsv,
  type ColumnKey,
  type ColumnMap,
  type DateFormat,
  type DetectionReason,
  type NumberFormat,
  type SignConvention,
} from '../../lib/expenseCsv';
import { EncryptedBadge, ExpensesPage, categoryLabel, shortDate, useMoney } from './expensesShared';

// Gastos → Importar CSV (A6). Four steps as in the prototype: Archivo · Columnas · Signo y
// revisión · Confirmar. The file is read here, in the browser; the server gets normalized rows only
// and answers the preview with the same plan it applies on import.
export default function ExpensesImportPage({ token }: { token: string }) {
  return (
    <ExpensesPage token={token} section="import">
      {(meta, reloadMeta) => <ImportBody token={token} meta={meta} reloadMeta={reloadMeta} />}
    </ExpensesPage>
  );
}

const MAX_ROWS = 2000;
const STEPS = ['file', 'columns', 'review', 'confirm'] as const;

interface Parsed {
  fileName: string;
  headers: string[];
  rows: string[][];
}

const STATUS_CHIP: Record<ExpenseImportStatus, string> = {
  expense: 'to-chip-cancelled',
  credit: 'to-chip-approved',
  internal: 'ex-chip-auto',
  duplicate: 'to-chip-pending',
  invalid: 'to-chip-rejected',
};

function ImportBody({ token, meta, reloadMeta }: { token: string; meta: ExpensesMeta; reloadMeta: () => void }) {
  const { t, i18n } = useTranslation('expenses');
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const money = useMoney(meta.currency);
  const accounts = meta.accounts.filter((a) => a.isActive);

  const [step, setStep] = useState(0);
  const [accountId, setAccountId] = useState(() => {
    const wanted = params.get('account');
    return accounts.find((a) => a.id === wanted)?.id ?? accounts.find((a) => a.type !== 'cash')?.id ?? accounts[0]?.id ?? '';
  });
  const account = accounts.find((a) => a.id === accountId) ?? null;
  const [paste, setPaste] = useState('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [numberFormat, setNumberFormat] = useState<NumberFormat>('ar');
  const [dateFormat, setDateFormat] = useState<DateFormat>('dmy');
  const [convention, setConvention] = useState<SignConvention>('neg_debit');
  const [detection, setDetection] = useState<{ reason: DetectionReason; examples: string[] } | null>(null);
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [forced, setForced] = useState<Set<number>>(new Set());
  const [saveProfile, setSaveProfile] = useState(true);
  const [plan, setPlan] = useState<ExpenseImportRowPlan[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = (text: string, fileName: string) => {
    if (!account) return;
    const all = parseCsv(text);
    if (all.length < 2) {
      toast.error(t('import.noRows'));
      return;
    }
    const [headers, ...rows] = all;
    if (rows.length > MAX_ROWS) {
      toast.error(t('import.tooManyRows', { max: MAX_ROWS }));
      return;
    }
    const saved = account.importProfile;
    const guessed = guessColumns(headers);
    // A saved format points at columns by header name; headers missing from this file keep the guess.
    for (const [key, header] of Object.entries(saved?.columns ?? {})) {
      const idx = headers.indexOf(header ?? '');
      if (idx >= 0) guessed[key as ColumnKey] = idx;
    }
    const amountCells = rows.flatMap((r) => [guessed.amount, guessed.debit, guessed.credit].filter((i) => i >= 0).map((i) => r[i] ?? ''));
    const nf = saved?.numberFormat ?? guessNumberFormat(amountCells);
    const df = saved?.dateFormat ?? guessDateFormat(guessed.date >= 0 ? rows.map((r) => r[guessed.date] ?? '') : []);
    const detected = detectConvention(rows, guessed, nf, { saved: saved?.convention ?? null, isCard: account.type === 'credit_card' });
    setParsed({ fileName, headers, rows });
    setMap(guessed);
    setNumberFormat(nf);
    setDateFormat(df);
    setConvention(detected.convention);
    setDetection({ reason: detected.reason, examples: detected.examples });
    setFlipped(new Set());
    setForced(new Set());
    setPlan(null);
    setStep(1);
  };

  const pickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    load(await file.text(), file.name);
  };

  // Rows as the server will receive them; recomputed on every correction.
  const normalized = useMemo<ExpenseImportRowInput[]>(() => {
    if (!parsed || !map) return [];
    return parsed.rows.map((r, i) => {
      const n = normalizeRow(r, map, { numberFormat, dateFormat, convention }, flipped.has(i));
      return {
        date: n.date ?? '',
        description: n.description,
        amountCents: n.amountCents ?? 0,
        direction: n.direction,
        installment: n.installment,
        forceImport: forced.has(i),
      };
    });
  }, [parsed, map, numberFormat, dateFormat, convention, flipped, forced]);

  useEffect(() => {
    if (step < 2 || !accountId || normalized.length === 0) return;
    // The previous plan stays on screen while a correction is re-checked; Continue waits for it.
    let cancelled = false;
    setPreviewing(true);
    api
      .previewExpenseImport(token, accountId, normalized)
      .then((res) => !cancelled && setPlan(res.rows))
      .catch((e) => !cancelled && toast.error((e as Error).message))
      .finally(() => !cancelled && setPreviewing(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step >= 2, accountId, normalized, token]);

  const totals = useMemo(() => {
    const rows = plan ?? [];
    const of = (s: ExpenseImportStatus) => rows.filter((r) => r.status === s);
    const sum = (rs: ExpenseImportRowPlan[]) => rs.reduce((acc, r) => acc + r.amountCents, 0);
    return {
      expenses: of('expense'),
      expensesCents: sum(of('expense')),
      credits: of('credit'),
      creditsCents: sum(of('credit')),
      internal: of('internal').length,
      duplicates: of('duplicate').length,
      invalid: of('invalid').length,
      reconciled: rows.filter((r) => r.confirms || r.reconciles).length,
    };
  }, [plan]);

  const toggle = (set: Set<number>, setter: (s: Set<number>) => void, i: number) => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setter(next);
  };

  const doImport = async () => {
    if (!parsed || !map || !account) return;
    setImporting(true);
    const columns: Partial<Record<ColumnKey, string>> = {};
    for (const [key, idx] of Object.entries(map)) if (idx >= 0) columns[key as ColumnKey] = parsed.headers[idx];
    try {
      const result = await api.importExpenses(token, {
        accountId: account.id,
        rows: normalized,
        profile: { convention, numberFormat, dateFormat, columns },
        saveProfile,
      });
      toast.success(
        [
          t('import.done', { count: result.imported }),
          result.confirmed ? t('import.doneConfirmed', { count: result.confirmed }) : '',
          result.reconciled ? t('import.doneReconciled', { count: result.reconciled }) : '',
        ]
          .filter(Boolean)
          .join(' · '),
      );
      reloadMeta();
      navigate('/expenses/movements');
    } catch (e) {
      toast.error((e as Error).message);
      setImporting(false);
    }
  };

  if (accounts.length === 0) {
    return (
      <div className="card ex-card">
        <strong>{t('state.noAccountsTitle')}</strong>
        <p className="ex-muted m-0 text-sm">{t('state.noAccountsBody')}</p>
        <button type="button" className="btn-primary self-start" onClick={() => navigate('/expenses/accounts')}>
          {t('state.addAccount')}
        </button>
      </div>
    );
  }

  const columnFields: { key: ColumnKey; optional?: boolean }[] =
    convention === 'cols'
      ? [{ key: 'date' }, { key: 'description' }, { key: 'debit' }, { key: 'credit' }, { key: 'installment', optional: true }]
      : [
          { key: 'date' },
          { key: 'description' },
          { key: 'amount' },
          ...(convention === 'type_col' ? [{ key: 'type' as const }] : []),
          { key: 'installment', optional: true },
        ];
  const categories = new Map(meta.categories.map((c) => [c.id, c]));

  return (
    <>
      <ol className="ex-steps" aria-label={t('import.stepsLabel')}>
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'active' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="ex-step-n">{i + 1}</span>
            {t(`import.steps.${s}`)}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="card ex-card">
          <div className="flex flex-col gap-2">
            <strong>{t('import.whichAccount')}</strong>
            <div className="flex flex-wrap gap-2">
              {accounts.map((a) => (
                <button key={a.id} type="button" className={`ex-option ${a.id === accountId ? 'active' : ''}`} onClick={() => setAccountId(a.id)}>
                  {a.name}
                </button>
              ))}
            </div>
            {account && <AccountFormatHint account={account} />}
          </div>
          <div className="ex-two">
            <div className="ex-drop">
              <strong className="text-sm">{t('import.uploadTitle')}</strong>
              <span className="ex-muted text-sm">{t('import.uploadBody')}</span>
              <label className="btn-primary inline-flex cursor-pointer items-center gap-2 self-start">
                <UploadIcon className="h-4 w-4" />
                {t('import.chooseFile')}
                <input type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={pickFile} />
              </label>
            </div>
            <div className="ex-drop">
              <label htmlFor="ex-paste" className="text-sm font-semibold">
                {t('import.pasteTitle')}
              </label>
              <textarea
                id="ex-paste"
                rows={4}
                className="font-mono text-xs"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={t('import.pastePlaceholder')}
              />
              <button type="button" className="btn-secondary self-start" disabled={!paste.trim()} onClick={() => load(paste, t('import.pastedName'))}>
                {t('import.usePaste')}
              </button>
            </div>
          </div>
        </section>
      )}

      {step === 1 && parsed && map && (
        <section className="card ex-card">
          <p className="ex-muted m-0 text-sm">{t('import.fileInfo', { name: parsed.fileName, count: parsed.rows.length })}</p>
          <div className="ex-filters">
            {columnFields.map(({ key, optional }) => (
              <label key={key} className="ex-field">
                {t(`import.columns.${key}`)}
                {optional ? ` (${t('import.optional')})` : ''}
                <select value={map[key]} onChange={(e) => setMap({ ...map, [key]: Number(e.target.value) })}>
                  <option value={-1}>{t('import.noColumn')}</option>
                  {parsed.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || t('import.columnN', { n: i + 1 })}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="ex-filters">
            <label className="ex-field">
              {t('import.numberFormat')}
              <select value={numberFormat} onChange={(e) => setNumberFormat(e.target.value as NumberFormat)}>
                <option value="ar">1.234,56</option>
                <option value="us">1,234.56</option>
              </select>
            </label>
            <label className="ex-field">
              {t('import.dateFormat')}
              <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
                <option value="dmy">{t('import.dateFormats.dmy')}</option>
                <option value="mdy">{t('import.dateFormats.mdy')}</option>
                <option value="ymd">{t('import.dateFormats.ymd')}</option>
              </select>
            </label>
          </div>
          <div className="ex-raw">
            <span className="ex-muted text-xs font-semibold">{t('import.rawRows')}</span>
            {[parsed.headers, ...parsed.rows.slice(0, 3)].map((r, i) => (
              <code key={i}>{r.join(' · ')}</code>
            ))}
          </div>
          <div className="flex justify-between gap-2">
            <button type="button" className="btn-secondary" onClick={() => setStep(0)}>
              {t('import.back')}
            </button>
            <button type="button" className="btn-primary" disabled={map.date < 0 || map.description < 0} onClick={() => setStep(2)}>
              {t('import.continue')}
            </button>
          </div>
        </section>
      )}

      {step === 2 && parsed && (
        <>
          <section className="card ex-card ex-sign">
            <strong>{t('import.signTitle')}</strong>
            {detection && (
              <span className="text-sm">
                {t(`import.reason.${detection.reason}`, { examples: detection.examples.map((d) => `“${d}”`).join(t('import.and')) })}
              </span>
            )}
            <div className="flex flex-wrap gap-2">
              {CONVENTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`ex-option ${c === convention ? 'active' : ''}`}
                  onClick={() => {
                    setConvention(c);
                    setDetection(null);
                  }}
                >
                  {t(`convention.${c}`)}
                </button>
              ))}
            </div>
            <span className="ex-muted text-xs">{t('import.signNote')}</span>
          </section>

          <div className="sh-kpis">
            <Kpi label={t('import.kpi.expenses')} value={money(totals.expensesCents)} hint={t('import.kpi.rows', { count: totals.expenses.length })} />
            <Kpi label={t('import.kpi.credits')} value={money(totals.creditsCents)} hint={t('import.kpi.rows', { count: totals.credits.length })} />
            <Kpi label={t('import.kpi.internal')} value={String(totals.internal)} hint={t('import.kpi.internalHint')} />
            <Kpi label={t('import.kpi.duplicates')} value={String(totals.duplicates)} hint={t('import.kpi.duplicatesHint')} />
            <Kpi label={t('import.kpi.reconciled')} value={String(totals.reconciled)} hint={t('import.kpi.reconciledHint')} />
          </div>

          {plan === null ? (
            <TableSkeleton rows={6} />
          ) : (
            <div className="full-table-wrap">
              <table className="table full-table to-table">
                <thead>
                  <tr>
                    <th>{t('movements.columns.date')}</th>
                    <th>{t('movements.columns.description')}</th>
                    <th>{t('movements.columns.type')}</th>
                    <th>{t('import.categoryOrNote')}</th>
                    <th className="text-right">{t('movements.columns.amount')}</th>
                    <th>{t('import.fix')}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((r) => (
                    <tr key={r.index}>
                      <td className="ex-muted whitespace-nowrap">{r.date ? shortDate(r.date, i18n.language) : '—'}</td>
                      <td className="!whitespace-normal">
                        <span className="flex flex-col">
                          <span>{r.description || parsed.rows[r.index]?.join(' · ')}</span>
                          {r.installment && <span className="ex-muted text-xs">{t('import.installment', { value: r.installment })}</span>}
                        </span>
                      </td>
                      <td>
                        <span className={`to-chip ${STATUS_CHIP[r.status]}`}>{t(`import.status.${r.status}`)}</span>
                      </td>
                      <td className="ex-muted !whitespace-normal text-sm">
                        {r.status === 'duplicate' && r.duplicateOf
                          ? t('import.note.duplicate', { description: r.duplicateOf.description, date: shortDate(r.duplicateOf.date, i18n.language) })
                          : r.confirms
                            ? r.confirms.estimatedCents !== r.amountCents
                              ? t('import.note.confirmsChanged', { name: r.confirms.description, estimated: money(r.confirms.estimatedCents) })
                              : t('import.note.confirms', { name: r.confirms.description })
                            : r.reconciles
                              ? t('import.note.reconciles', { name: r.reconciles.name })
                              : r.status === 'internal'
                                ? t('import.note.internal')
                                : r.status === 'invalid'
                                  ? t('import.note.invalid')
                                  : r.status === 'expense'
                                    ? categoryLabel(t, r.categoryId ? categories.get(r.categoryId) : null)
                                    : '—'}
                      </td>
                      <td className={`num text-right whitespace-nowrap ${r.direction === 'credit' ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>
                        {r.status === 'invalid' ? '—' : `${r.direction === 'credit' ? '+ ' : ''}${money(r.amountCents)}`}
                      </td>
                      <td>
                        <span className="flex flex-wrap gap-1.5">
                          {r.status !== 'invalid' && (
                            <button type="button" className="btn-secondary btn-sm" onClick={() => toggle(flipped, setFlipped, r.index)}>
                              {t('import.flip')}
                            </button>
                          )}
                          {(r.status === 'duplicate' || forced.has(r.index)) && (
                            <button type="button" className="btn-secondary btn-sm" onClick={() => toggle(forced, setForced, r.index)}>
                              {forced.has(r.index) ? t('import.skip') : t('import.importAnyway')}
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
              {t('import.back')}
            </button>
            <button type="button" className="btn-primary" disabled={!plan || previewing} onClick={() => setStep(3)}>
              {t('import.reviewed')}
            </button>
          </div>
        </>
      )}

      {step === 3 && account && (
        <section className="card ex-card max-w-2xl">
          <strong className="text-base">{t('import.confirmTitle', { account: account.name })}</strong>
          <span className="text-sm">
            {t('import.confirmAmounts', {
              expenses: totals.expenses.length,
              expensesAmount: money(totals.expensesCents),
              credits: totals.credits.length,
              creditsAmount: money(totals.creditsCents),
            })}
          </span>
          <span className="text-sm">
            {t('import.confirmOthers', { internal: totals.internal, duplicates: totals.duplicates, reconciled: totals.reconciled })}
            {totals.invalid > 0 && ` · ${t('import.confirmInvalid', { count: totals.invalid })}`}
          </span>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={saveProfile} onChange={(e) => setSaveProfile(e.target.checked)} />
            {t('import.saveProfile', { account: account.name })}
          </label>
          <span className="self-start">
            <EncryptedBadge />
          </span>
          <span className="ex-muted text-xs">{t('import.fileDiscarded')}</span>
          <div className="flex justify-between gap-2">
            <button type="button" className="btn-secondary" onClick={() => setStep(2)}>
              {t('import.back')}
            </button>
            <button type="button" className="btn-primary" disabled={importing} onClick={doImport}>
              {importing ? t('import.importing') : t('import.doImport')}
            </button>
          </div>
        </section>
      )}
    </>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="sh-kpi">
      <span className="sh-kpi-label">{label}</span>
      <span className="sh-kpi-value num">{value}</span>
      <span className="sh-kpi-hint">{hint}</span>
    </div>
  );
}

function AccountFormatHint({ account }: { account: ExpenseAccount }) {
  const { t } = useTranslation('expenses');
  if (account.type === 'cash') return <span className="ex-hint">{t('import.cashHint')}</span>;
  const saved = account.importProfile?.convention;
  return <span className="ex-hint">{saved ? t('import.savedFormat', { format: t(`convention.${saved}`) }) : t('import.firstImport')}</span>;
}
