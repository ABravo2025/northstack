import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import StatTile from '../components/metrics/StatTile';
import TableBody from '../components/common/TableBody';
import { AdminApiError, adminApi, type ClientDetail, type StaffNote, type StaffTask } from './adminApi';
import type { AdminSession } from './AdminApp';
import { MODULE_LABEL, STATUS, TONE_COLOR, ago, attentionText, date, daysUntil, healthTone, money, planLabel } from './format';
import { Avatar, Chip, ErrorBox, Loading, Meter, Panel } from './ui';
import ClientActions, { ResetPasswordButton } from './ClientActions';
import AgreementTab from './AgreementTab';
import SupportAccessPanel from './SupportAccessPanel';

type Tab = 'summary' | 'users' | 'usage' | 'modules' | 'billing' | 'support' | 'notes' | 'activity';
const TABS: [Tab, string][] = [
  ['summary', 'Resumen'],
  ['users', 'Usuarios'],
  ['usage', 'Uso'],
  ['modules', 'Módulos y límites'],
  ['billing', 'Facturación'],
  ['support', 'Soporte'],
  ['notes', 'Notas y tareas'],
  ['activity', 'Actividad'],
];

const ROLE_LABEL: Record<string, string> = { owner: 'Dueño', admin: 'Admin', member: 'Miembro' };
const PROVIDER_LABEL: Record<string, string> = { dodopayments: 'Dodo Payments', mercadopago: 'Mercado Pago' };
const CHANNEL_LABEL: Record<string, string> = {
  organic: 'Búsqueda / orgánico',
  paid_ads: 'Publicidad',
  referral: 'Recomendación',
  content: 'Contenido',
  outbound_sales: 'Ventas (contacto nuestro)',
  partnership: 'Alianza',
  other: 'Otro',
};

export default function AdminClientDetail({ session }: { session: AdminSession }) {
  const { id = '' } = useParams();
  const [c, setC] = useState<ClientDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('summary');
  const [flash, setFlash] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(() => {
    adminApi
      .client(session.token, id)
      .then(setC)
      .catch((e) => (e instanceof AdminApiError && e.status === 401 ? session.onUnauthorized() : setError(e.status === 404 ? 'Ese cliente no existe.' : e.message)));
  }, [session, id]);

  useEffect(() => {
    setC(null);
    load();
  }, [load]);

  const done = (message: string) => {
    setFlash(message);
    setRefreshKey((k) => k + 1);
    load();
  };

  if (error) return <ErrorBox message={error} />;
  if (!c) return <Loading />;

  const trialLeft = c.status === 'trialing' ? daysUntil(c.trialEndsAt) : null;
  const perUser = c.subscription && c.plan ? c.subscription.extraSeatPriceCents : null;

  return (
    <div className="grid gap-4">
      <div>
        <div className="mb-1 text-xs text-ink-faint dark:text-dark-ink-faint">
          <Link to="/clients" className="text-accent hover:underline dark:text-brand-blue-light">Clientes</Link> / {c.name}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <Avatar name={c.name} size={48} />
            <div>
              <h2 className="text-xl font-semibold">{c.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted dark:text-dark-ink-muted">
                <Chip tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Chip>
                <Chip tone={c.plan ? 'accent' : 'neutral'} dot={false}>{planLabel(c.plan)}</Chip>
                {c.hasAgreement && <Chip tone="warn" dot={false}>Acuerdo especial</Chip>}
                <span>{[c.country, c.industry].filter(Boolean).join(' · ') || '—'}</span>
                <span>Cliente desde {date(c.createdAt)}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {c.owner && <a className="btn-secondary" href={`mailto:${c.owner.email}`}>Escribir al dueño</a>}
            <ClientActions client={c} session={session} onDone={done} />
          </div>
        </div>
      </div>

      {flash && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" role="status">
          <span>{flash}</span>
          <button type="button" className="text-xs underline" onClick={() => setFlash(null)}>Cerrar</button>
        </div>
      )}

      {c.deletionScheduledAt && (
        <div className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
          <b>Se elimina el {date(c.deletionScheduledAt)}.</b> Nadie del cliente puede entrar y ese día se borran todos sus datos. Hasta entonces se puede deshacer con "Acciones → Cancelar eliminación".
        </div>
      )}
      <SupportAccessPanel client={c} session={session} refreshKey={refreshKey} onDone={done} />

      {c.attention.map((a, i) => {
        const t = attentionText(a);
        return (
          <div key={i} className={`rounded-lg px-4 py-2.5 text-sm ${a.level === 'bad' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'}`}>
            <b>{t.title}.</b> {t.detail}
          </div>
        );
      })}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        <StatTile label="Usuarios activos" value={String(c.activeUsers)} subtitle={c.plan ? `facturados: ${c.billedUsers}` : 'en la prueba'} />
        <StatTile label="MRR" value={c.mrrCents ? money(c.mrrCents, c.currency) : '—'} subtitle={perUser ? `${money(perUser, c.currency)} por usuario` : 'todavía no paga'} />
        {trialLeft !== null
          ? <StatTile label="Prueba" value={trialLeft <= 0 ? 'Vencida' : `${trialLeft} días`} subtitle={`vence ${date(c.trialEndsAt)}`} />
          : <StatTile label="Próximo cobro" value={date(c.nextChargeAt)} subtitle={c.subscription?.provider ? PROVIDER_LABEL[c.subscription.provider] ?? c.subscription.provider : undefined} />}
        <StatTile label="Salud" value={`${c.health.score}/100`} subtitle={c.health.score >= 70 ? 'sana' : c.health.score >= 40 ? 'a mirar' : 'en riesgo'} />
        <StatTile label="Última actividad" value={ago(c.lastSeenAt)} />
        <StatTile label="Tickets abiertos" value={String(c.openTickets)} />
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-line dark:border-dark-line" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2 text-sm ${tab === key ? 'border-accent font-semibold text-accent dark:text-brand-blue-light' : 'border-transparent text-ink-muted hover:text-ink dark:text-dark-ink-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'summary' && <SummaryTab c={c} />}
      {tab === 'users' && <UsersTab c={c} session={session} onDone={done} />}
      {tab === 'usage' && <UsageTab c={c} />}
      {tab === 'modules' && <AgreementTab key={c.agreement?.setAt ?? 'none'} c={c} session={session} onDone={done} />}
      {tab === 'billing' && <BillingTab c={c} />}
      {tab === 'support' && <SupportTab c={c} />}
      {tab === 'notes' && <NotesTab c={c} session={session} />}
      {tab === 'activity' && <Panel title="Actividad de la cuenta" aside="registro, plan, cobros y cambios"><div className="p-4"><Timeline items={c.timeline} /></div></Panel>}
    </div>
  );
}

function SummaryTab({ c }: { c: ClientDetail }) {
  const parts: [string, number, string][] = [
    ['Acceso del equipo', c.health.access, '40%'],
    ['Módulos en uso', c.health.modules, '25%'],
    ['Pagos al día', c.health.payments, '25%'],
    ['Crecimiento', c.health.growth, '10%'],
  ];
  const tone = TONE_COLOR[healthTone(c.health.score)];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-4">
        <Panel title="Usuarios activos por día" aside="últimos 30 días">
          <div className="p-4">
            <DailyChart points={c.dailyActive} max={Math.max(c.activeUsers, 1)} />
            {c.dailyActive.every((d) => d.users === 0) && (
              <p className="mt-2 text-xs text-ink-faint dark:text-dark-ink-faint">Se registra desde el 3 de octubre de 2026; los días anteriores quedan en cero.</p>
            )}
          </div>
        </Panel>
        <Panel title="Últimos movimientos">
          <div className="p-4"><Timeline items={c.timeline.slice(0, 4)} /></div>
        </Panel>
      </div>
      <div className="grid content-start gap-4">
        <Panel title="Salud de la cuenta" aside="ponderación entre paréntesis">
          <div className="p-4">
            <div className="mx-auto mb-4 grid h-24 w-24 place-items-center rounded-full" style={{ background: `conic-gradient(${tone} ${c.health.score * 3.6}deg, var(--color-line) 0)` }}>
              <div className="grid h-[74px] w-[74px] place-items-center rounded-full bg-surface-1 text-2xl font-bold tabular-nums dark:bg-dark-surface">{c.health.score}</div>
            </div>
            <div className="grid gap-2.5 text-sm">
              {parts.map(([label, v, w]) => (
                <div key={label} className="grid grid-cols-[150px_minmax(0,1fr)_32px] items-center gap-3">
                  <span>{label} <span className="text-xs text-ink-faint dark:text-dark-ink-faint">({w})</span></span>
                  <Meter value={v} tone={TONE_COLOR[healthTone(v)]} />
                  <span className="text-right tabular-nums">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
        <Panel title="Datos de la empresa">
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 p-4 text-sm">
            {([
              ['Dueño', c.owner?.name],
              ['Email', c.owner?.email],
              ['Razón social', c.company.legalName],
              ['País', c.country],
              ['Rubro', c.industry],
              ['Tamaño', c.company.companySize],
              ['Cómo nos conoció', c.company.acquisitionChannel ? CHANNEL_LABEL[c.company.acquisitionChannel] ?? c.company.acquisitionChannel : null],
              ['Teléfono', c.company.phone],
              ['Web', c.company.website],
              ['Moneda', c.company.currency],
            ] as const).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-ink-faint dark:text-dark-ink-faint">{k}</dt>
                <dd className="m-0 font-medium [overflow-wrap:anywhere]">{v || '—'}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </div>
  );
}

function DailyChart({ points, max }: { points: ClientDetail['dailyActive']; max: number }) {
  const W = 560, H = 150, p = 26;
  const top = Math.max(max, ...points.map((d) => d.users), 1);
  const n = points.length;
  const X = (i: number) => p + ((W - p - 8) * i) / (n - 1);
  const Y = (v: number) => 8 + (H - 8 - 22) * (1 - v / top);
  const line = points.map((d, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(d.users).toFixed(1)}`).join(' ');
  const ticks = [...new Set([0, Math.round(top / 2), top])];
  const label = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Usuarios activos por día">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={p} x2={W - 8} y1={Y(t)} y2={Y(t)} stroke="currentColor" className="text-line dark:text-dark-line" />
          <text x={p - 6} y={Y(t) + 4} textAnchor="end" fontSize="11" className="fill-ink-faint dark:fill-dark-ink-faint">{t}</text>
        </g>
      ))}
      <path d={`${line} L${X(n - 1)},${Y(0)} L${X(0)},${Y(0)} Z`} fill={TONE_COLOR.accent} fillOpacity="0.1" />
      <path d={line} fill="none" stroke={TONE_COLOR.accent} strokeWidth="2" />
      <circle cx={X(n - 1)} cy={Y(points[n - 1].users)} r="4" fill={TONE_COLOR.accent} />
      <text x={p} y={H - 4} fontSize="11" className="fill-ink-faint dark:fill-dark-ink-faint">{label(points[0].date)}</text>
      <text x={W - 8} y={H - 4} textAnchor="end" fontSize="11" className="fill-ink-faint dark:fill-dark-ink-faint">hoy</text>
    </svg>
  );
}

function UsersTab({ c, session, onDone }: { c: ClientDetail; session: AdminSession; onDone: (m: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface-1 dark:border-dark-line dark:bg-dark-surface">
      <table className="table w-full">
        <thead>
          <tr><th>Persona</th><th>Email</th><th>Rol</th><th>Última actividad</th><th>Estado</th><th>Alta</th><th style={{ textAlign: 'right' }}>Acciones</th></tr>
        </thead>
        <TableBody colSpan={7} isEmpty={c.users.length === 0} empty={{ title: 'Sin usuarios.' }}>
          {c.users.map((u) => (
            <tr key={u.id}>
              <td className="font-semibold">{u.name}</td>
              <td className="font-mono text-xs">{u.email}</td>
              <td>{ROLE_LABEL[u.role] ?? u.role}</td>
              <td>{ago(u.lastSeenAt)}</td>
              <td><Chip tone={u.status === 'active' ? 'good' : 'neutral'}>{u.status === 'active' ? 'Activo' : 'Inactivo'}</Chip></td>
              <td className="tabular-nums">{date(u.createdAt)}</td>
              <td className="text-right">{u.status === 'active' && <ResetPasswordButton client={c} user={u} session={session} onDone={onDone} />}</td>
            </tr>
          ))}
        </TableBody>
      </table>
    </div>
  );
}

function UsageTab({ c }: { c: ClientDetail }) {
  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto rounded-lg border border-line bg-surface-1 dark:border-dark-line dark:bg-dark-surface">
        <table className="table w-full">
          <thead>
            <tr><th>Módulo</th><th>Adopción</th><th style={{ textAlign: 'right' }}>Personas</th><th style={{ textAlign: 'right' }}>Cambios</th><th>Último uso</th><th>En su plan</th></tr>
          </thead>
          <tbody>
            {c.usage.map((m) => (
              <tr key={m.module}>
                <td className="font-semibold">{MODULE_LABEL[m.module]}</td>
                <td className="min-w-[200px]">
                  <div className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-2.5">
                    <Meter value={m.adoptionPct} tone={TONE_COLOR.accent} />
                    <span className="text-right tabular-nums">{m.adoptionPct}%</span>
                  </div>
                </td>
                <td className="text-right tabular-nums">{m.users}</td>
                <td className="text-right tabular-nums">{m.changes}</td>
                <td>{m.lastUsedAt ? ago(m.lastUsedAt) : 'sin uso en 30 días'}</td>
                <td>{m.included ? <Chip tone="good">Incluido</Chip> : <Chip tone="neutral">No incluido</Chip>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rounded-lg border border-dashed border-line bg-surface-2 px-3 py-2 text-xs text-ink-muted dark:border-dark-line dark:bg-dark-raised dark:text-dark-ink-muted">
        Adopción = porcentaje de usuarios activos del cliente que crearon o editaron algo en ese módulo en los últimos 30 días. Solo mirar no cuenta.
      </p>
    </div>
  );
}

function BillingTab({ c }: { c: ClientDetail }) {
  const s = c.subscription;
  const statusTone = (st: string) => (st === 'paid' ? 'good' : st === 'failed' ? 'bad' : 'neutral');
  const statusLabel: Record<string, string> = { paid: 'Pagado', failed: 'Rechazado', refunded: 'Reembolsado' };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Panel title="Cobros" aside={s?.provider ? PROVIDER_LABEL[s.provider] ?? s.provider : undefined}>
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead><tr><th>Fecha</th><th>Período</th><th style={{ textAlign: 'right' }}>Monto</th><th>Estado</th></tr></thead>
            <TableBody colSpan={4} isEmpty={c.invoices.length === 0} empty={{ title: 'Todavía no hubo cobros.' }}>
              {c.invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="tabular-nums">{date(inv.paidAt ?? inv.createdAt)}</td>
                  <td className="tabular-nums text-ink-muted dark:text-dark-ink-muted">{date(inv.periodStart)} – {date(inv.periodEnd)}</td>
                  <td className="text-right tabular-nums">{money(inv.amountCents, inv.currency)}</td>
                  <td><Chip tone={statusTone(inv.status)}>{statusLabel[inv.status] ?? inv.status}</Chip></td>
                </tr>
              ))}
            </TableBody>
          </table>
        </div>
      </Panel>
      <Panel title="Suscripción">
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 p-4 text-sm">
          {([
            ['Plan', c.plan ? planLabel(c.plan) : 'Prueba gratis'],
            ['Precio base', s && c.plan ? `${money(s.lockedPriceCents, s.currency)} (congelado)` : null],
            ['Por usuario extra', s?.extraSeatPriceCents ? money(s.extraSeatPriceCents, s.currency) : null],
            ['Usuarios facturados', c.billedUsers !== null ? `${c.billedUsers} (mínimo 3)` : null],
            ['Medio de pago', s?.card],
            ['Proveedor', s?.provider ? PROVIDER_LABEL[s.provider] ?? s.provider : null],
            ['Próximo cobro', c.nextChargeAt ? date(c.nextChargeAt) : null],
            ['Cancelación pedida', s?.cancelledAt ? `${date(s.cancelledAt)} · efectiva ${date(s.cancellationEffectiveAt)}` : null],
            ['Motivo', s?.cancellationReason],
          ] as const).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-faint dark:text-dark-ink-faint">{k}</dt>
              <dd className="m-0 font-medium [overflow-wrap:anywhere]">{v || '—'}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}

function SupportTab({ c }: { c: ClientDetail }) {
  const navigate = useNavigate();
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface-1 dark:border-dark-line dark:bg-dark-surface">
      <table className="table w-full">
        <thead><tr><th>Asunto</th><th>Quién</th><th>Estado</th><th>Creado</th></tr></thead>
        <TableBody colSpan={4} isEmpty={c.tickets.length === 0} empty={{ title: 'Sin tickets.' }}>
          {c.tickets.map((t) => (
            <tr key={t.id} className="cursor-pointer" onClick={() => navigate(`/tickets/${t.id}`)}>
              <td className="font-semibold">{t.subject}</td>
              <td>{t.reporter ?? 'Soporte'}</td>
              <td><Chip tone={t.open ? 'info' : 'neutral'}>{t.status}</Chip></td>
              <td className="tabular-nums">{date(t.createdAt)}</td>
            </tr>
          ))}
        </TableBody>
      </table>
    </div>
  );
}

function NotesTab({ c, session }: { c: ClientDetail; session: AdminSession }) {
  const [notes, setNotes] = useState<StaffNote[] | null>(null);
  const [tasks, setTasks] = useState<StaffTask[] | null>(null);
  const [text, setText] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([adminApi.notes(session.token, c.id), adminApi.tasks(session.token, c.id)])
      .then(([n, t]) => { setNotes(n); setTasks(t); })
      .catch((e) => setError(e.message));
  }, [session.token, c.id]);
  useEffect(load, [load]);

  const addNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await adminApi.addNote(session.token, c.id, 'Nota', text.trim());
      setText('');
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const addTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    try {
      await adminApi.addTask(session.token, c.id, taskTitle.trim(), taskDue || null);
      setTaskTitle('');
      setTaskDue('');
      setAddingTask(false);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const toggle = async (t: StaffTask) => {
    try {
      await adminApi.setTaskDone(session.token, c.id, t.id, !t.completedAt);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!notes || !tasks) return error ? <ErrorBox message={error} /> : <Loading />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Notas internas" aside="el cliente nunca las ve">
        <div className="grid gap-3 p-4">
          {notes.length === 0 && <p className="text-sm text-ink-faint dark:text-dark-ink-faint">Todavía no hay notas.</p>}
          {notes.map((n) => (
            <div key={n.id} className="border-b border-line-soft pb-3 text-sm last:border-0 dark:border-dark-line-soft">
              <div className="mb-0.5 text-xs text-ink-faint dark:text-dark-ink-faint">{date(n.createdAt)} · {n.createdBy ? `${n.createdBy.firstName} ${n.createdBy.lastName}` : '—'}</div>
              <div className="whitespace-pre-wrap">{n.description}</div>
            </div>
          ))}
          <form onSubmit={addNote} className="grid gap-2">
            <label htmlFor="admin-note" className="text-sm font-medium">Nueva nota</label>
            <textarea id="admin-note" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: hablé con el dueño, quieren sumar Nómina en noviembre" />
            <div><button type="submit" className="btn-primary" disabled={!text.trim()}>Guardar nota</button></div>
          </form>
          {error && <ErrorBox message={error} />}
        </div>
      </Panel>
      <Panel title="Tareas de seguimiento">
        <table className="table w-full">
          <TableBody colSpan={3} isEmpty={tasks.length === 0 && !addingTask} empty={{ title: 'Sin tareas.' }} onAdd={addingTask ? undefined : () => setAddingTask(true)} addLabel="Agregar tarea">
            {tasks.map((t) => (
              <tr key={t.id}>
                <td className="w-8"><input type="checkbox" checked={!!t.completedAt} onChange={() => toggle(t)} aria-label="Hecha" /></td>
                <td className={t.completedAt ? 'text-ink-faint line-through dark:text-dark-ink-faint' : ''}>{t.title}</td>
                <td className="text-right tabular-nums text-ink-faint dark:text-dark-ink-faint">{t.dueDate ? date(t.dueDate) : ''}</td>
              </tr>
            ))}
            {addingTask && (
              <tr>
                <td colSpan={3}>
                  <form onSubmit={addTask} className="flex flex-wrap items-center gap-2">
                    <input autoFocus value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Ej.: llamar para ofrecer Growth" aria-label="Tarea" className="min-w-0 flex-1" />
                    <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} aria-label="Vence" />
                    <button type="submit" className="btn-primary" disabled={!taskTitle.trim()}>Agregar</button>
                    <button type="button" className="btn-secondary" onClick={() => setAddingTask(false)}>Cancelar</button>
                  </form>
                </td>
              </tr>
            )}
          </TableBody>
        </table>
      </Panel>
    </div>
  );
}

const KIND_TITLE: Record<string, string> = {
  signup: 'Se registró',
  invoice_paid: 'Cobro aprobado',
  invoice_failed: 'Cobro rechazado',
  invoice_refunded: 'Cobro reembolsado',
  cancel_requested: 'Pidió cancelar',
  staff_extend_trial: 'Prueba extendida',
  staff_change_plan: 'Plan cambiado',
  staff_suspend: 'Cuenta suspendida',
  staff_reactivate: 'Cuenta reactivada',
  staff_reset_password: 'Link de contraseña nueva enviado',
  staff_set_agreement: 'Acuerdo especial guardado',
  staff_clear_agreement: 'Acuerdo especial quitado',
  staff_free_months: 'Meses gratis',
  staff_next_charge_date: 'Cambió la fecha del próximo cobro',
  staff_payment_reminder: 'Se le pidió actualizar la tarjeta',
  staff_export_data: 'Datos exportados',
  staff_support_request: 'Se pidió acceso de soporte',
  staff_support_enter: 'Soporte entró a la cuenta',
  staff_support_end: 'Soporte terminó el acceso',
  staff_delete_scheduled: 'Marcado para eliminar',
  staff_delete_cancelled: 'Eliminación cancelada',
  staff_delete_requested_by_owner: 'El dueño pidió eliminar la cuenta',
};

function Timeline({ items }: { items: ClientDetail['timeline'] }) {
  if (items.length === 0) return <p className="text-sm text-ink-faint dark:text-dark-ink-faint">Sin movimientos.</p>;
  return (
    <ul className="m-0 grid list-none gap-3.5 p-0">
      {items.map((e, i) => {
        let title = KIND_TITLE[e.kind] ?? e.text;
        let detail = '';
        if (e.kind.startsWith('invoice_')) {
          const [amount, cur] = e.text.split('|');
          detail = money(Number(amount), cur);
          if (e.by) detail += ` · ${PROVIDER_LABEL[e.by] ?? e.by}`;
        } else if (e.kind.startsWith('staff_')) {
          detail = `Motivo: ${e.text}`;
        } else if (e.kind === 'cancel_requested') {
          detail = e.text ? `"${e.text}"` : '';
        } else if (e.kind === 'log') {
          title = e.text;
        }
        return (
          <li key={i} className="grid grid-cols-[96px_12px_minmax(0,1fr)] gap-2.5 text-sm">
            <time className="pt-px text-right text-xs text-ink-faint dark:text-dark-ink-faint">{date(e.at)}</time>
            <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-accent-tint" />
            <div className="min-w-0">
              <div className="font-semibold">{title}</div>
              {detail && <div className="text-ink-muted dark:text-dark-ink-muted">{detail}</div>}
              {e.by && !e.kind.startsWith('invoice_') && <div className="text-xs text-ink-faint dark:text-dark-ink-faint">{e.by}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
