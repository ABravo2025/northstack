import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import StatTile from '../components/metrics/StatTile';
import TableBody from '../components/common/TableBody';
import { AdminApiError, adminBillingApi, type BillingOverview } from './adminApi';
import type { AdminSession } from './AdminApp';
import { TONE_COLOR, date, money } from './format';
import { Chip, ErrorBox, Loading, Panel } from './ui';

// Admin Center v2, stage 3: everything Northstack charged, both providers, by month.

const STATUS_LABEL: Record<string, { label: string; tone: 'good' | 'bad' | 'neutral' }> = {
  paid: { label: 'Pagado', tone: 'good' },
  failed: { label: 'Rechazado', tone: 'bad' },
  refunded: { label: 'Reembolsado', tone: 'neutral' },
};
const PROVIDER: Record<string, string> = { dodopayments: 'Dodo', mercadopago: 'Mercado Pago' };

function monthLabel(m: string): string {
  return new Date(m + '-15T12:00:00Z').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}

function shiftMonth(m: string, delta: number): string {
  const d = new Date(m + '-15T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}

export default function AdminBilling({ session }: { session: AdminSession }) {
  const current = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(current);
  const [data, setData] = useState<BillingOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'all' | 'paid' | 'failed' | 'refunded'>('all');

  useEffect(() => {
    setData(null);
    adminBillingApi
      .overview(session.token, month)
      .then(setData)
      .catch((e) => (e instanceof AdminApiError && e.status === 401 ? session.onUnauthorized() : setError(e.message)));
  }, [session, month]);

  if (error) return <ErrorBox message={error} />;

  const currencies = data ? Array.from(new Set([...Object.keys(data.totals), ...Object.keys(data.mrrByCurrency)])).sort() : [];
  const invoices = data ? data.invoices.filter((i) => status === 'all' || i.status === status) : [];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Facturación</h2>
          <p className="mt-1 text-sm text-ink-muted dark:text-dark-ink-muted">Todo lo que se cobró, en Dodo (USD) y Mercado Pago (ARS)</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary" aria-label="Mes anterior" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
          <span className="min-w-[150px] text-center text-sm font-semibold first-letter:uppercase">{monthLabel(month)}</span>
          <button type="button" className="btn-secondary" aria-label="Mes siguiente" disabled={month >= current} onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
        </div>
      </div>

      {!data ? <Loading /> : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
            {(currencies.length ? currencies : ['USD']).map((cur) => (
              <StatTile key={`paid-${cur}`} label={`Cobrado en ${cur}`} value={money(data.totals[cur]?.paid ?? 0, cur)} subtitle={`${data.totals[cur]?.count ?? 0} cobros en el mes`} />
            ))}
            {(currencies.length ? currencies : ['USD']).map((cur) => (
              <StatTile key={`mrr-${cur}`} label={`MRR en ${cur}`} value={money(data.mrrByCurrency[cur] ?? 0, cur)} subtitle="lo que se cobra por mes hoy" />
            ))}
            <StatTile label="Clientes que pagan" value={String(data.payingClients)} />
            <StatTile label="Pagos fallidos" value={String(data.pastDue.length)} subtitle={data.pastDue.length ? 'clientes con pago pendiente' : 'ninguno'} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Panel title="Cobrado por mes" aside="últimos 6 meses">
              <div className="p-4"><MonthlyChart monthly={data.monthly} currencies={currencies} /></div>
            </Panel>
            <div className="grid content-start gap-4">
              <Panel title="Próximos cobros" aside="30 días">
                <table className="table w-full">
                  <TableBody colSpan={3} isEmpty={data.upcoming.length === 0} empty={{ title: 'Ningún cobro en los próximos 30 días.' }}>
                    {data.upcoming.map((u) => (
                      <tr key={u.id}>
                        <td><Link to={`/clients/${u.id}`} className="font-semibold hover:underline">{u.name}</Link></td>
                        <td className="tabular-nums">{date(u.at)}</td>
                        <td className="text-right tabular-nums">{money(u.amountCents, u.currency)}</td>
                      </tr>
                    ))}
                  </TableBody>
                </table>
              </Panel>
              <Panel title="Pagos fallidos y cancelaciones">
                <table className="table w-full">
                  <TableBody colSpan={2} isEmpty={data.pastDue.length + data.cancellations.length === 0} empty={{ title: 'Nada pendiente.' }}>
                    {data.pastDue.map((p) => (
                      <tr key={`pd-${p.id}`}>
                        <td><Link to={`/clients/${p.id}`} className="font-semibold hover:underline">{p.name}</Link></td>
                        <td className="text-right"><Chip tone="bad">Pago fallido</Chip></td>
                      </tr>
                    ))}
                    {data.cancellations.map((c) => (
                      <tr key={`cx-${c.id}`}>
                        <td>
                          <Link to={`/clients/${c.id}`} className="font-semibold hover:underline">{c.name}</Link>
                          {c.reason && <div className="text-xs text-ink-faint dark:text-dark-ink-faint">"{c.reason}"</div>}
                        </td>
                        <td className="text-right"><Chip tone="warn">Se va el {date(c.effectiveAt)}</Chip></td>
                      </tr>
                    ))}
                  </TableBody>
                </table>
              </Panel>
            </div>
          </div>

          <Panel title={`Cobros de ${monthLabel(month)}`}>
            <div className="flex flex-wrap gap-2 px-4 pt-3">
              {(['all', 'paid', 'failed', 'refunded'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={status === s}
                  onClick={() => setStatus(s)}
                  className={`rounded-full border px-3 py-1 text-sm ${status === s ? 'border-accent bg-accent-tint font-semibold text-accent dark:text-brand-blue-light' : 'border-line bg-surface-1 text-ink-muted dark:border-dark-line dark:bg-dark-surface dark:text-dark-ink-muted'}`}
                >
                  {s === 'all' ? 'Todos' : STATUS_LABEL[s].label}
                </button>
              ))}
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="table w-full">
                <thead><tr><th>Fecha</th><th>Cliente</th><th>Proveedor</th><th>Período</th><th style={{ textAlign: 'right' }}>Monto</th><th>Estado</th></tr></thead>
                <TableBody colSpan={6} isEmpty={invoices.length === 0} empty={{ title: 'No hubo cobros en este mes.' }}>
                  {invoices.map((i) => (
                    <tr key={i.id}>
                      <td className="tabular-nums">{date(i.at)}</td>
                      <td>
                        {i.tenant ? (
                          <Link to={`/clients/${i.tenant.id}`} className="font-semibold hover:underline">{i.tenant.name}</Link>
                        ) : (
                          <span className="text-ink-muted dark:text-dark-ink-muted">Cliente eliminado</span>
                        )}
                      </td>
                      <td>{PROVIDER[i.provider] ?? i.provider}</td>
                      <td className="tabular-nums text-ink-muted dark:text-dark-ink-muted">{date(i.periodStart)} – {date(i.periodEnd)}</td>
                      <td className="text-right tabular-nums">{money(i.amountCents, i.currency)}</td>
                      <td><Chip tone={STATUS_LABEL[i.status]?.tone ?? 'neutral'}>{STATUS_LABEL[i.status]?.label ?? i.status}</Chip></td>
                    </tr>
                  ))}
                </TableBody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

// Grouped bars per month, one bar per currency, each currency on its own scale (USD and ARS can't
// share an axis), labelled with its amount instead of a shared y-axis.
function MonthlyChart({ monthly, currencies }: { monthly: BillingOverview['monthly']; currencies: string[] }) {
  const curs = currencies.length ? currencies : ['USD'];
  const colors = [TONE_COLOR.accent, TONE_COLOR.good, TONE_COLOR.info];
  const max: Record<string, number> = {};
  for (const c of curs) max[c] = Math.max(1, ...monthly.map((m) => m.paid[c] ?? 0));
  const W = 560, H = 200, padB = 26, padT = 18;
  const groupW = (W - 20) / monthly.length;
  const barW = Math.min(28, (groupW * 0.7) / curs.length);
  const compact = (cents: number, cur: string) => {
    const v = cents / 100;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
    return cur === 'ARS' ? String(Math.round(v)) : v.toFixed(0);
  };
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Cobrado por mes">
        <line x1={10} x2={W - 10} y1={H - padB} y2={H - padB} stroke="currentColor" className="text-line dark:text-dark-line" />
        {monthly.map((m, i) => {
          const x0 = 10 + i * groupW + (groupW - barW * curs.length - 4 * (curs.length - 1)) / 2;
          return (
            <g key={m.month}>
              {curs.map((c, j) => {
                const v = m.paid[c] ?? 0;
                const h = ((H - padB - padT) * v) / max[c];
                const x = x0 + j * (barW + 4);
                return (
                  <g key={c}>
                    <rect x={x} y={H - padB - h} width={barW} height={Math.max(h, v ? 2 : 0)} rx="3" fill={colors[j % colors.length]} />
                    {v > 0 && <text x={x + barW / 2} y={H - padB - h - 4} textAnchor="middle" fontSize="10" className="fill-ink-muted dark:fill-dark-ink-muted">{compact(v, c)}</text>}
                  </g>
                );
              })}
              <text x={10 + i * groupW + groupW / 2} y={H - 8} textAnchor="middle" fontSize="11" className="fill-ink-faint dark:fill-dark-ink-faint">
                {new Date(m.month + '-15T12:00:00Z').toLocaleDateString('es-AR', { month: 'short' })}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-ink-muted dark:text-dark-ink-muted">
        {curs.map((c, j) => (
          <span key={c} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: colors[j % colors.length] }} /> {c}</span>
        ))}
        <span className="text-ink-faint dark:text-dark-ink-faint">cada moneda en su propia escala</span>
      </div>
    </div>
  );
}
