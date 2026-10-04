import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import StatTile from '../components/metrics/StatTile';
import TableBody from '../components/common/TableBody';
import Modal from '../components/common/Modal';
import { AdminApiError } from './adminApi';
import { adminReferralsApi, type MemberTotals, type PayoutMethod, type ReferralMemberDetail, type ReferralMemberRow } from './adminReferralsApi';
import type { AdminSession } from './AdminApp';
import { date, money, type Tone } from './format';
import { Chip, ErrorBox, Loading, Panel } from './ui';

// Admin Center — Referidos (2026-10-04, mockup approved by Alejandro). Members of the program,
// who each one referred, what is owed, and "Registrar transferencia" with a mandatory receipt.

const METHOD: Record<PayoutMethod, string> = {
  wise: 'Wise',
  payoneer: 'Payoneer',
  paypal: 'PayPal',
  wire_intl: 'Wire transfer',
  bank_ar: 'Transferencia AR',
};

const DETAIL_LABEL: Record<string, string> = {
  email: 'Email',
  holderName: 'Titular',
  holderAddress: 'Dirección del titular',
  bankName: 'Banco',
  swift: 'SWIFT / BIC',
  accountNumber: 'IBAN / n.º de cuenta',
  routingNumber: 'Routing / ABA',
  bankCountry: 'País del banco',
  taxId: 'CUIT / CUIL',
  cbu: 'CBU / CVU',
  alias: 'Alias',
};

const REFERRAL_STATUS: Record<ReferralMemberDetail['referrals'][number]['status'], { label: string; tone: Tone }> = {
  trialing: { label: 'En prueba', tone: 'neutral' },
  no_payment: { label: 'Sin pagos', tone: 'neutral' },
  active: { label: 'Pagando', tone: 'info' },
  completed: { label: 'Completada', tone: 'good' },
  void: { label: 'Anulada', tone: 'bad' },
};

const COMMISSION_STATUS: Record<ReferralMemberDetail['commissions'][number]['status'], { label: string; tone: Tone }> = {
  pending: { label: 'En espera', tone: 'neutral' },
  payable: { label: 'A pagar', tone: 'warn' },
  paid: { label: 'Pagada', tone: 'good' },
  void: { label: 'Anulada', tone: 'bad' },
};

function sortedCurrencies(totals: Record<string, MemberTotals>): string[] {
  return Object.keys(totals).sort((a, b) => (a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b)));
}

function joinMoney(totals: Record<string, MemberTotals>, key: 'payable' | 'pending' | 'paid'): string {
  const parts = sortedCurrencies(totals)
    .filter((cur) => totals[cur][key] > 0)
    .map((cur) => money(totals[cur][key], cur));
  return parts.length ? parts.join(' + ') : '—';
}

function handleError(session: AdminSession, setError: (m: string) => void) {
  return (e: unknown) => (e instanceof AdminApiError && e.status === 401 ? session.onUnauthorized() : setError((e as Error).message));
}

async function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------- list ----------

export default function AdminReferrals({ session }: { session: AdminSession }) {
  const [rows, setRows] = useState<ReferralMemberRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyReady, setOnlyReady] = useState(false);

  useEffect(() => {
    adminReferralsApi.list(session.token).then(setRows).catch(handleError(session, setError));
  }, [session]);

  if (error) return <ErrorBox message={error} />;
  if (!rows) return <Loading />;

  const isReady = (r: ReferralMemberRow) => Object.values(r.totals).some((t) => t.ready);
  const visible = onlyReady ? rows.filter(isReady) : rows;
  const sumBy = (pick: (t: MemberTotals) => number, filter: (t: MemberTotals) => boolean = () => true) => {
    const out: Record<string, number> = {};
    for (const r of rows) for (const [cur, t] of Object.entries(r.totals)) if (filter(t)) out[cur] = (out[cur] ?? 0) + pick(t);
    const parts = Object.entries(out).filter(([, v]) => v > 0).sort(([a], [b]) => (a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b)));
    return parts.length ? parts.map(([cur, v]) => money(v, cur)).join(' + ') : '—';
  };
  const readyCount = rows.filter(isReady).length;

  return (
    <div className="grid gap-5">
      <div>
        <h2 className="text-xl font-semibold">Referidos</h2>
        <p className="mt-1 text-sm text-ink-muted dark:text-dark-ink-muted">Miembros del programa y lo que corresponde pagarle a cada uno.</p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <StatTile label="Listo para pagar" value={sumBy((t) => t.payable, (t) => t.ready)} subtitle={readyCount === 1 ? '1 miembro superó el mínimo' : `${readyCount} miembros superaron el mínimo`} />
        <StatTile label="Liberado bajo mínimo" value={sumBy((t) => t.payable, (t) => !t.ready)} subtitle="se acumula hasta el mínimo" />
        <StatTile label="En espera" value={sumBy((t) => t.pending)} subtitle="30 días después de cada pago" />
        <StatTile label="Pagado histórico" value={sumBy((t) => t.paid)} />
      </div>

      <Panel
        title="Miembros"
        aside={
          <span className="inline-flex gap-1">
            {([false, true] as const).map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setOnlyReady(v)}
                className={`rounded-md px-2.5 py-1 text-xs ${onlyReady === v ? 'bg-accent font-semibold text-white' : 'text-ink-muted hover:bg-surface-2 dark:text-dark-ink-muted dark:hover:bg-dark-raised'}`}
              >
                {v ? 'Listos para pagar' : 'Todos'}
              </button>
            ))}
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Miembro</th>
                <th>Empresa</th>
                <th>Cobra por</th>
                <th className="text-right">Referidos</th>
                <th className="text-right">A pagar ahora</th>
                <th className="text-right">En espera</th>
                <th className="text-right">Pagado</th>
              </tr>
            </thead>
            <TableBody colSpan={7} isEmpty={visible.length === 0} empty={{ title: onlyReady ? 'Nadie superó el mínimo todavía.' : 'Todavía nadie se unió al programa.' }}>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/referrals/${r.id}`} className="font-semibold hover:underline">{r.name}</Link>
                    <div className="text-xs text-ink-faint dark:text-dark-ink-faint">{r.code}</div>
                  </td>
                  <td>{r.tenant ? <Link to={`/clients/${r.tenant.id}`} className="hover:underline">{r.tenant.name}</Link> : '—'}</td>
                  <td>{METHOD[r.payoutMethod]}</td>
                  <td className="text-right tabular-nums">{r.referralCount}</td>
                  <td className="text-right tabular-nums">
                    {sortedCurrencies(r.totals).filter((cur) => r.totals[cur].payable > 0).length === 0
                      ? '—'
                      : sortedCurrencies(r.totals)
                          .filter((cur) => r.totals[cur].payable > 0)
                          .map((cur) => {
                            const t = r.totals[cur];
                            return (
                              <div key={cur}>
                                <span className={t.ready ? 'font-semibold text-emerald-700 dark:text-emerald-300' : ''}>{money(t.payable, cur)}</span>
                                <div className="text-xs text-ink-faint dark:text-dark-ink-faint">
                                  {t.ready ? 'Listo para pagar' : `Faltan ${money(t.minPayout - t.payable, cur)}`}
                                </div>
                              </div>
                            );
                          })}
                  </td>
                  <td className="text-right tabular-nums">{joinMoney(r.totals, 'pending')}</td>
                  <td className="text-right tabular-nums">{joinMoney(r.totals, 'paid')}</td>
                </tr>
              ))}
            </TableBody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

// ---------- detail ----------

export function AdminReferralMember({ session }: { session: AdminSession }) {
  const { id = '' } = useParams();
  const [m, setM] = useState<ReferralMemberDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payCurrency, setPayCurrency] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<ReferralMemberDetail['commissions'][number] | null>(null);

  const load = useCallback(() => {
    adminReferralsApi.detail(session.token, id).then(setM).catch(handleError(session, setError));
  }, [session, id]);
  useEffect(load, [load]);

  if (error) return <ErrorBox message={error} />;
  if (!m) return <Loading />;

  const currencies = sortedCurrencies(m.totals);
  const readyCurrencies = currencies.filter((cur) => m.totals[cur].ready);

  const downloadReceipt = (payoutId: string, fileName: string) =>
    adminReferralsApi.receipt(session.token, payoutId).then((b) => saveBlob(b, fileName)).catch(handleError(session, setError));

  return (
    <div className="grid gap-5">
      <div className="text-xs text-ink-faint dark:text-dark-ink-faint">
        <Link to="/referrals" className="text-accent hover:underline dark:text-brand-blue-light">Referidos</Link> / {m.name}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{m.name}</h2>
          <p className="mt-1 text-sm text-ink-muted dark:text-dark-ink-muted">
            {m.tenant ? <>Usuario de <Link to={`/clients/${m.tenant.id}`} className="hover:underline">{m.tenant.name}</Link></> : 'Sin empresa'} · cobra por {METHOD[m.payoutMethod]} · código {m.code}
            {!m.userActive && ' · usuario inactivo'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {currencies.length === 0 || readyCurrencies.length === 0 ? (
            <button type="button" className="btn-primary" disabled title="Nada llegó al mínimo para pagar">Registrar transferencia</button>
          ) : (
            readyCurrencies.map((cur) => (
              <button key={cur} type="button" className="btn-primary" onClick={() => setPayCurrency(cur)}>
                Registrar transferencia{readyCurrencies.length > 1 ? ` en ${cur}` : ''}
              </button>
            ))
          )}
        </div>
      </div>

      {notice && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">{notice}</div>}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <StatTile
          label="A pagar ahora"
          value={joinMoney(m.totals, 'payable')}
          subtitle={
            currencies
              .filter((cur) => m.totals[cur].payable > 0)
              .map((cur) => (m.totals[cur].ready ? `${cur}: superó el mínimo` : `${cur}: faltan ${money(m.totals[cur].minPayout - m.totals[cur].payable, cur)}`))
              .join(' · ') || 'nada liberado'
          }
        />
        <StatTile label="En espera" value={joinMoney(m.totals, 'pending')} subtitle="se libera a los 30 días del pago" />
        <StatTile label="Pagado" value={joinMoney(m.totals, 'paid')} subtitle={`${m.payouts.length} ${m.payouts.length === 1 ? 'transferencia' : 'transferencias'}`} />
        <StatTile label="Referidos" value={String(m.referrals.length)} subtitle="empresas" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
        <Panel title="Datos de cobro" aside={<Chip tone="good">TyC v{m.termsVersion} · {date(m.termsAcceptedAt)}</Chip>}>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 p-4 text-sm">
            <dt className="text-ink-faint dark:text-dark-ink-faint">Medio</dt>
            <dd className="m-0">{METHOD[m.payoutMethod]}</dd>
            {Object.entries(m.payoutDetails).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-ink-faint dark:text-dark-ink-faint">{DETAIL_LABEL[k] ?? k}</dt>
                <dd className="m-0 break-words font-mono text-[13px]">{v}</dd>
              </div>
            ))}
            <dt className="text-ink-faint dark:text-dark-ink-faint">Email de la cuenta</dt>
            <dd className="m-0 break-words">{m.email}</dd>
          </dl>
          <p className="border-t border-line px-4 py-2 text-xs text-ink-faint dark:border-dark-line dark:text-dark-ink-faint">Cifrado en la base. Solo lo ve platform_admin.</p>
        </Panel>

        <Panel title="A quiénes refirió" aside={`${m.referrals.length} ${m.referrals.length === 1 ? 'empresa' : 'empresas'}`}>
          {m.referrals.length === 0 && <p className="px-4 py-6 text-sm text-ink-faint dark:text-dark-ink-faint">Todavía no refirió empresas.</p>}
          {m.referrals.map((r) => {
            const rows = m.commissions.filter((c) => c.referralId === r.id);
            return (
              <div key={r.id} className="border-t border-line first:border-t-0 dark:border-dark-line">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold">{r.companyName}</div>
                    <div className="text-xs text-ink-faint dark:text-dark-ink-faint">Se registró el {date(r.createdAt)} · {r.commissionCount} de 3 pagos</div>
                  </div>
                  <Chip tone={REFERRAL_STATUS[r.status].tone}>{REFERRAL_STATUS[r.status].label}</Chip>
                </div>
                {rows.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="table w-full">
                      <thead>
                        <tr>
                          <th>Pago</th>
                          <th className="text-right">Monto</th>
                          <th className="text-right">Comisión</th>
                          <th>Se libera</th>
                          <th>Estado</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((c) => (
                          <tr key={c.id}>
                            <td>{c.paymentNumber} de 3</td>
                            <td className="text-right tabular-nums">{money(c.paymentCents, c.currency)}</td>
                            <td className="text-right tabular-nums">{money(c.commissionCents, c.currency)}</td>
                            <td className="tabular-nums">{date(c.dueAt)}</td>
                            <td title={c.voidReason ?? undefined}>
                              <Chip tone={COMMISSION_STATUS[c.status].tone}>
                                {COMMISSION_STATUS[c.status].label}
                                {c.payout ? ` · ${c.payout.number}` : ''}
                              </Chip>
                            </td>
                            <td className="text-right">
                              {(c.status === 'pending' || c.status === 'payable') && (
                                <button type="button" className="btn-secondary btn-sm" onClick={() => setVoiding(c)}>Anular</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </Panel>
      </div>

      <Panel title="Transferencias">
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Transferencia</th>
                <th>Fecha</th>
                <th>Referencia</th>
                <th className="text-right">Monto</th>
                <th>Comprobante</th>
              </tr>
            </thead>
            <TableBody colSpan={5} isEmpty={m.payouts.length === 0} empty={{ title: 'Todavía no hay transferencias.' }}>
              {m.payouts.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="font-semibold">{p.number}</div>
                    <div className="text-xs text-ink-faint dark:text-dark-ink-faint">{p.commissionCount} {p.commissionCount === 1 ? 'comisión' : 'comisiones'} · {METHOD[p.payoutMethod]}</div>
                  </td>
                  <td className="tabular-nums">{date(p.transferredAt)}</td>
                  <td className="tabular-nums">{p.reference ?? '—'}</td>
                  <td className="text-right font-semibold tabular-nums">{money(p.amountCents, p.currency)}</td>
                  <td>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => downloadReceipt(p.id, p.receiptFileName)}>Ver comprobante</button>
                  </td>
                </tr>
              ))}
            </TableBody>
          </table>
        </div>
      </Panel>

      {payCurrency && (
        <PayModal
          session={session}
          member={m}
          currency={payCurrency}
          onClose={() => setPayCurrency(null)}
          onDone={(msg) => { setPayCurrency(null); setNotice(msg); load(); }}
        />
      )}
      {voiding && (
        <VoidModal
          session={session}
          commission={voiding}
          onClose={() => setVoiding(null)}
          onDone={() => { setVoiding(null); setNotice('Comisión anulada.'); load(); }}
        />
      )}
    </div>
  );
}

const MAX_RECEIPT_BYTES = 2 * 1024 * 1024;

function PayModal({ session, member, currency, onClose, onDone }: { session: AdminSession; member: ReferralMemberDetail; currency: string; onClose: () => void; onDone: (msg: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [transferredAt, setTransferredAt] = useState(today);
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const payable = member.commissions.filter((c) => c.status === 'payable' && c.currency === currency);
  const amount = payable.reduce((s, c) => s + c.commissionCents, 0);

  const pickFile = (f: File | null) => {
    setError(null);
    if (f && f.size > MAX_RECEIPT_BYTES) {
      setError('El comprobante pesa más de 2 MB.');
      setFile(null);
      return;
    }
    setFile(f);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Subí el comprobante de la transferencia.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const receipt = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        reader.readAsDataURL(file);
      });
      await adminReferralsApi.pay(session.token, member.id, { currency, transferredAt: `${transferredAt}T12:00:00Z`, reference: reference.trim(), receipt, receiptFileName: file.name });
      onDone(`Transferencia de ${money(amount, currency)} registrada. Se le avisó a ${member.name} por email, con el comprobante.`);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 401) session.onUnauthorized();
      else setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="Registrar transferencia"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" form="referral-pay-form" className="btn-primary" disabled={busy || !file}>
            {busy ? 'Guardando…' : 'Marcar como pagado y avisar'}
          </button>
        </>
      }
    >
      <form id="referral-pay-form" onSubmit={submit} className="grid gap-4">
        <p className="text-sm">
          Se marcan como pagadas <strong>{payable.length} {payable.length === 1 ? 'comisión liberada' : 'comisiones liberadas'}</strong> por{' '}
          <strong>{money(amount, currency)}</strong> a <strong>{member.name}</strong> ({METHOD[member.payoutMethod]}). Le llega un email con el comprobante.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium" htmlFor="pay-date">
            Fecha de la transferencia
            <input id="pay-date" type="date" max={today} value={transferredAt} onChange={(e) => setTransferredAt(e.target.value)} className="mt-1 w-full" required />
          </label>
          <label className="text-sm font-medium" htmlFor="pay-ref">
            Referencia / n.º de operación
            <input id="pay-ref" type="text" value={reference} onChange={(e) => setReference(e.target.value)} className="mt-1 w-full" placeholder="opcional" maxLength={120} />
          </label>
        </div>
        <label
          htmlFor="pay-file"
          className={`block cursor-pointer rounded-lg border-2 border-dashed px-4 py-5 text-center text-sm ${file ? 'border-emerald-500 text-emerald-700 dark:text-emerald-300' : 'border-line-strong text-ink-muted dark:border-dark-line dark:text-dark-ink-muted'}`}
        >
          {file ? `✓ ${file.name}` : 'Subí el comprobante · PDF, JPG o PNG · máx. 2 MB · obligatorio'}
          <input id="pay-file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </form>
    </Modal>
  );
}

function VoidModal({ session, commission, onClose, onDone }: { session: AdminSession; commission: ReferralMemberDetail['commissions'][number]; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Escribí el motivo.');
      return;
    }
    setBusy(true);
    try {
      await adminReferralsApi.voidCommission(session.token, commission.id, reason.trim());
      onDone();
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 401) session.onUnauthorized();
      else setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="Anular comisión"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" form="referral-void-form" className="btn-primary" disabled={busy}>Anular</button>
        </>
      }
    >
      <form id="referral-void-form" onSubmit={submit} className="grid gap-3">
        <p className="text-sm">
          {commission.companyName}, pago {commission.paymentNumber} de 3: {money(commission.commissionCents, commission.currency)}. El miembro la va a ver como anulada.
        </p>
        <label className="text-sm font-medium" htmlFor="void-reason">
          Motivo
          <input id="void-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full" placeholder="Ej.: reembolso del pago" maxLength={300} />
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </form>
    </Modal>
  );
}
