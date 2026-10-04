import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TableBody from '../components/common/TableBody';
import { AdminApiError, adminApi, type ClientRow } from './adminApi';
import type { AdminSession } from './AdminApp';
import { STATUS, ago, date, daysUntil, healthTone, money, planLabel } from './format';
import { Avatar, Chip, ErrorBox, Loading } from './ui';

type Filter = 'all' | 'attention' | 'trialing' | 'paying' | 'risk' | 'agreement';

const FILTERS: { key: Filter; label: string; test: (c: ClientRow) => boolean }[] = [
  { key: 'all', label: 'Todos', test: () => true },
  { key: 'attention', label: 'Necesitan atención', test: (c) => c.attention.length > 0 },
  { key: 'trialing', label: 'En prueba', test: (c) => c.status === 'trialing' },
  { key: 'paying', label: 'Pagan', test: (c) => c.mrrCents > 0 },
  { key: 'agreement', label: 'Con acuerdo especial', test: (c) => c.hasAgreement },
  { key: 'risk', label: 'En riesgo', test: (c) => c.health.score < 45 && ['active', 'trialing', 'past_due', 'cancelling'].includes(c.status) },
];

export default function AdminClients({ session }: { session: AdminSession }) {
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    adminApi
      .clients(session.token)
      .then(setRows)
      .catch((e) => (e instanceof AdminApiError && e.status === 401 ? session.onUnauthorized() : setError(e.message)));
  }, [session]);

  const visible = useMemo(() => {
    if (!rows) return [];
    const test = FILTERS.find((f) => f.key === filter)!.test;
    const needle = q.trim().toLowerCase();
    return rows.filter(test).filter((c) => !needle || [c.name, c.owner?.name, c.owner?.email, c.country, c.industry].some((v) => v?.toLowerCase().includes(needle)));
  }, [rows, filter, q]);

  if (error) return <ErrorBox message={error} />;
  if (!rows) return <Loading />;

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-xl font-semibold">Clientes</h2>
        <p className="mt-1 text-sm text-ink-muted dark:text-dark-ink-muted">Cada empresa registrada en Northstack</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por empresa, persona, email o país"
          aria-label="Buscar clientes"
          className="min-w-0 flex-[1_1_240px]"
        />
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-sm ${filter === f.key ? 'border-accent bg-accent-tint font-semibold text-accent dark:text-brand-blue-light' : 'border-line bg-surface-1 text-ink-muted dark:border-dark-line dark:bg-dark-surface dark:text-dark-ink-muted'}`}
          >
            {f.label} <span className="tabular-nums opacity-70">{rows.filter(f.test).length}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface-1 dark:border-dark-line dark:bg-dark-surface">
        <table className="table w-full">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Estado</th>
              <th>Plan</th>
              <th style={{ textAlign: 'right' }}>Usuarios</th>
              <th style={{ textAlign: 'right' }}>MRR</th>
              <th>Salud</th>
              <th>Última actividad</th>
              <th>Prueba / Próximo cobro</th>
            </tr>
          </thead>
          <TableBody colSpan={8} isEmpty={visible.length === 0} empty={{ title: rows.length ? 'Ningún cliente coincide con el filtro.' : 'Todavía no hay clientes.' }}>
            {visible.map((c) => {
              const left = c.status === 'trialing' ? daysUntil(c.trialEndsAt) : null;
              return (
                <tr
                  key={c.id}
                  tabIndex={0}
                  className="cursor-pointer"
                  onClick={() => navigate(`/clients/${c.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/clients/${c.id}`)}
                >
                  <td>
                    <div className="flex min-w-[200px] items-center gap-2.5">
                      <Avatar name={c.name} />
                      <div className="min-w-0">
                        <div className="font-semibold">{c.name}</div>
                        <div className="text-xs text-ink-faint dark:text-dark-ink-faint">{[c.owner?.name, c.country].filter(Boolean).join(' · ')}</div>
                      </div>
                    </div>
                  </td>
                  <td><Chip tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Chip></td>
                  <td className="whitespace-nowrap">
                    <Chip tone={c.plan ? 'accent' : 'neutral'} dot={false}>{planLabel(c.plan)}</Chip>
                    {c.hasAgreement && <span className="ml-1"><Chip tone="warn" dot={false}>+ acuerdo</Chip></span>}
                  </td>
                  <td className="text-right tabular-nums">{c.activeUsers}</td>
                  <td className="text-right tabular-nums">{c.mrrCents ? money(c.mrrCents, c.currency) : '—'}</td>
                  <td><Chip tone={healthTone(c.health.score)}>{c.health.score}</Chip></td>
                  <td>{ago(c.lastSeenAt)}</td>
                  <td className="tabular-nums">
                    {c.status === 'trialing'
                      ? <>vence {date(c.trialEndsAt)} {left !== null && <span className="text-ink-faint dark:text-dark-ink-faint">({left} d)</span>}</>
                      : date(c.nextChargeAt)}
                  </td>
                </tr>
              );
            })}
          </TableBody>
        </table>
      </div>
    </div>
  );
}
