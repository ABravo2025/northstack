import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import StatTile from '../components/metrics/StatTile';
import { AdminApiError, adminApi, type Overview } from './adminApi';
import type { AdminSession } from './AdminApp';
import { STATUS, TONE_COLOR, attentionText, date, money } from './format';
import { Avatar, Chip, ErrorBox, Loading, Meter, Panel } from './ui';

export default function AdminHome({ session }: { session: AdminSession }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    adminApi
      .overview(session.token)
      .then(setData)
      .catch((e) => (e instanceof AdminApiError && e.status === 401 ? session.onUnauthorized() : setError(e.message)));
  }, [session]);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;

  const today = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const currencies = Object.keys(data.mrrByCurrency).sort();
  const mrrTiles = (currencies.length ? currencies : ['USD']).map((cur) => (
    <StatTile key={cur} label={`MRR en ${cur}`} value={money(data.mrrByCurrency[cur] ?? 0, cur)} subtitle="lo que se cobra por mes" />
  ));
  const planTotal = data.byPlan.growth + data.byPlan.starter + data.byPlan.none || 1;

  return (
    <div className="grid gap-5">
      <div>
        <h2 className="text-xl font-semibold">Inicio</h2>
        <p className="mt-1 text-sm text-ink-muted first-letter:uppercase dark:text-dark-ink-muted">{today} · {data.clients} clientes</p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        {mrrTiles}
        <StatTile label="Clientes que pagan" value={String(data.payingClients)} subtitle={`${data.trialing} en prueba`} />
        <StatTile label="Usuarios activos" value={String(data.activeUsers)} subtitle="en todos los clientes" />
        <StatTile
          label="Conversión de prueba"
          value={data.trialConversion ? `${data.trialConversion.pct}%` : '—'}
          subtitle={data.trialConversion ? `de ${data.trialConversion.cohort} registros (15–75 días)` : 'todavía sin datos'}
        />
        <StatTile label="Tickets abiertos" value={String(data.openTickets)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <Panel title="Necesitan atención" aside={`${data.attention.reduce((s, c) => s + c.attention.length, 0)} avisos`}>
            {data.attention.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-faint dark:text-dark-ink-faint">Nada que mirar. Todos los clientes están bien.</p>
            ) : (
              data.attention.flatMap((c) =>
                c.attention.map((a, i) => {
                  const t = attentionText(a);
                  return (
                    <div key={`${c.id}-${i}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-0 dark:border-dark-line-soft">
                      <span className="h-2 w-2 rounded-full" style={{ background: TONE_COLOR[a.level] }} />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{c.name} · {t.title}</div>
                        <div className="text-xs text-ink-muted dark:text-dark-ink-muted">{t.detail}</div>
                      </div>
                      <Link to={`/clients/${c.id}`} className="btn-secondary">Ver ficha</Link>
                    </div>
                  );
                }),
              )
            )}
          </Panel>
          <Panel title="Altas por semana" aside="registros y cuántos de ellos pagan hoy">
            <div className="p-4"><WeeksChart weeks={data.weeks} /></div>
          </Panel>
        </div>

        <div className="grid content-start gap-4">
          <Panel title="Últimos registros">
            <table className="table w-full">
              <tbody>
                {data.recentSignups.map((c) => (
                  <tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/clients/${c.id}`)}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={c.name} />
                        <div className="min-w-0">
                          <div className="font-semibold">{c.name}</div>
                          <div className="text-xs text-ink-faint dark:text-dark-ink-faint">{[c.country, c.industry].filter(Boolean).join(' · ') || '—'} · {date(c.createdAt)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right"><Chip tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel title="Clientes que pagan, por plan">
            <div className="grid gap-2.5 p-4 text-sm">
              {([
                ['Growth', data.byPlan.growth, TONE_COLOR.accent],
                ['Starter', data.byPlan.starter, TONE_COLOR.info],
                ['Todavía no pagan', data.byPlan.none, TONE_COLOR.neutral],
              ] as const).map(([label, n, color]) => (
                <div key={label} className="grid grid-cols-[130px_minmax(0,1fr)_32px] items-center gap-3">
                  <span>{label}</span>
                  <Meter value={(n / planTotal) * 100} tone={color} />
                  <span className="text-right tabular-nums">{n}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function WeeksChart({ weeks }: { weeks: Overview['weeks'] }) {
  const W = 560, H = 190, padL = 28, padB = 26, padT = 10;
  const max = Math.max(4, ...weeks.map((w) => w.signups));
  const step = max <= 5 ? 1 : Math.ceil(max / 4);
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  const bw = (W - padL - 10) / weeks.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const label = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Altas por semana">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 6} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-line dark:text-dark-line" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" className="fill-ink-faint dark:fill-dark-ink-faint">{t}</text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const x = padL + i * bw + bw * 0.18, bwid = bw * 0.3, base = H - padB;
          return (
            <g key={w.weekStart}>
              <rect x={x} y={y(w.signups)} width={bwid} height={base - y(w.signups)} rx="3" fill={TONE_COLOR.accent} />
              <rect x={x + bwid + 3} y={y(w.paying)} width={bwid} height={base - y(w.paying)} rx="3" fill={TONE_COLOR.good} />
              <text x={x + bwid} y={H - 8} textAnchor="middle" fontSize="11" className="fill-ink-faint dark:fill-dark-ink-faint">{label(w.weekStart)}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-ink-muted dark:text-dark-ink-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: TONE_COLOR.accent }} /> Registros</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: TONE_COLOR.good }} /> Pagan hoy</span>
      </div>
    </div>
  );
}
