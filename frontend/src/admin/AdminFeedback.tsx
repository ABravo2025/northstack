import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import TableBody from '../components/common/TableBody';
import { AdminApiError, feedbackApi, type FeedbackItem, type FeedbackKind, type FeedbackNote, type PlatformStatus } from './adminApi';
import type { AdminSession } from './AdminApp';
import { date } from './format';
import { ErrorBox, Loading, Panel } from './ui';

// Admin Center v2 (2026-10-03): Tickets and Ideas — what customers send from the app's feedback
// form. Same API the old Admin used (/api/platform/tickets|ideas); a reply on a ticket emails the
// customer who opened it (ideas never email).

const COPY: Record<FeedbackKind, { title: string; subtitle: string; singular: string; empty: string }> = {
  tickets: { title: 'Tickets', subtitle: 'Problemas y pedidos de ayuda que mandan los clientes desde la app', singular: 'ticket', empty: 'No hay tickets con este filtro.' },
  ideas: { title: 'Ideas', subtitle: 'Sugerencias que mandan los clientes desde la app', singular: 'idea', empty: 'No hay ideas con este filtro.' },
};

function StatusPill({ status }: { status: PlatformStatus }) {
  return (
    <span className="status-chip">
      <span className="status-dot" style={{ backgroundColor: status.color ?? (status.isTerminal ? '#8f8aa8' : '#0284c7') }} />
      {status.label}
    </span>
  );
}

export function AdminFeedbackList({ session, kind }: { session: AdminSession; kind: FeedbackKind }) {
  const [rows, setRows] = useState<FeedbackItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const copy = COPY[kind];

  useEffect(() => {
    setRows(null);
    feedbackApi
      .list(session.token, kind, { status: onlyOpen ? '__open__' : undefined })
      .then(setRows)
      .catch((e) => (e instanceof AdminApiError && e.status === 401 ? session.onUnauthorized() : setError(e.message)));
  }, [session, kind, onlyOpen]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !needle || [r.subject, r.tenant.name, r.user?.email, r.user?.firstName, r.user?.lastName].some((v) => v?.toLowerCase().includes(needle)));
  }, [rows, q]);

  if (error) return <ErrorBox message={error} />;

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-xl font-semibold">{copy.title}</h2>
        <p className="mt-1 text-sm text-ink-muted dark:text-dark-ink-muted">{copy.subtitle}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por asunto, cliente o persona" aria-label={`Buscar ${copy.title.toLowerCase()}`} className="min-w-0 flex-[1_1_240px]" />
        {[true, false].map((open) => (
          <button
            key={String(open)}
            type="button"
            aria-pressed={onlyOpen === open}
            onClick={() => setOnlyOpen(open)}
            className={`rounded-full border px-3 py-1 text-sm ${onlyOpen === open ? 'border-accent bg-accent-tint font-semibold text-accent dark:text-brand-blue-light' : 'border-line bg-surface-1 text-ink-muted dark:border-dark-line dark:bg-dark-surface dark:text-dark-ink-muted'}`}
          >
            {open ? 'Abiertos' : 'Todos'}
          </button>
        ))}
      </div>
      {!rows ? <Loading /> : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface-1 dark:border-dark-line dark:bg-dark-surface">
          <table className="table w-full">
            <thead><tr><th>Asunto</th><th>Cliente</th><th>Quién</th><th>Estado</th><th>Creado</th></tr></thead>
            <TableBody colSpan={5} isEmpty={visible.length === 0} empty={{ title: copy.empty }}>
              {visible.map((r) => (
                <tr key={r.id} tabIndex={0} className="cursor-pointer" onClick={() => navigate(`/${kind}/${r.id}`)} onKeyDown={(e) => e.key === 'Enter' && navigate(`/${kind}/${r.id}`)}>
                  <td className="font-semibold">{r.subject || '(sin asunto)'}</td>
                  <td>{r.tenant.name}</td>
                  <td>{r.user ? `${r.user.firstName} ${r.user.lastName}`.trim() : 'Soporte'}</td>
                  <td><StatusPill status={r.status} /></td>
                  <td className="tabular-nums">{date(r.createdAt)}</td>
                </tr>
              ))}
            </TableBody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AdminFeedbackDetail({ session, kind }: { session: AdminSession; kind: FeedbackKind }) {
  const { id = '' } = useParams();
  const [item, setItem] = useState<(FeedbackItem & { notes: FeedbackNote[] }) | null>(null);
  const [statuses, setStatuses] = useState<PlatformStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const copy = COPY[kind];

  const load = useCallback(() => {
    feedbackApi
      .get(session.token, kind, id)
      .then(setItem)
      .catch((e) => (e instanceof AdminApiError && e.status === 401 ? session.onUnauthorized() : setError(e.status === 404 ? `Ese ${copy.singular} no existe.` : e.message)));
  }, [session, kind, id, copy.singular]);

  useEffect(() => {
    load();
    feedbackApi.statuses(session.token, kind).then((s) => setStatuses(s.filter((x) => x.active).sort((a, b) => a.order - b.order))).catch(() => setStatuses([]));
  }, [load, session.token, kind]);

  const changeStatus = async (statusId: string) => {
    try {
      await feedbackApi.setStatus(session.token, kind, id, statusId);
      setFlash('Estado actualizado.');
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const sendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await feedbackApi.addNote(session.token, kind, id, reply.trim());
      setReply('');
      setFlash(kind === 'tickets' && item?.user ? `Respuesta guardada y enviada por mail a ${item.user.email}.` : 'Nota guardada.');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorBox message={error} />;
  if (!item) return <Loading />;

  return (
    <div className="grid gap-4">
      <div>
        <div className="mb-1 text-xs text-ink-faint dark:text-dark-ink-faint">
          <Link to={`/${kind}`} className="text-accent hover:underline dark:text-brand-blue-light">{copy.title}</Link> / {item.subject || '(sin asunto)'}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{item.subject || '(sin asunto)'}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted dark:text-dark-ink-muted">
              <StatusPill status={item.status} />
              <Link to={`/clients/${item.tenant.id}`} className="text-accent hover:underline dark:text-brand-blue-light">{item.tenant.name}</Link>
              <span>{item.user ? `${item.user.firstName} ${item.user.lastName} · ${item.user.email}` : 'Cargado por soporte'}</span>
              <span>{date(item.createdAt)}</span>
            </div>
          </div>
          <label className="grid gap-1 text-sm font-medium" htmlFor="fb-status">
            Estado
            <select id="fb-status" value={item.status.id} onChange={(e) => changeStatus(e.target.value)}>
              {statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              {!statuses.some((s) => s.id === item.status.id) && <option value={item.status.id}>{item.status.label}</option>}
            </select>
          </label>
        </div>
      </div>

      {flash && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" role="status">
          <span>{flash}</span>
          <button type="button" className="text-xs underline" onClick={() => setFlash(null)}>Cerrar</button>
        </div>
      )}

      <Panel title="Lo que escribió">
        <p className="m-0 whitespace-pre-wrap p-4 text-sm">{item.description || '—'}</p>
      </Panel>

      <Panel title={kind === 'tickets' ? 'Conversación' : 'Notas internas'} aside={kind === 'tickets' ? 'cada respuesta tuya le llega por mail' : 'el cliente no las ve'}>
        <div className="grid gap-3 p-4">
          {item.notes.length === 0 && <p className="m-0 text-sm text-ink-faint dark:text-dark-ink-faint">Todavía no hay respuestas.</p>}
          {item.notes.map((n) => {
            const staff = !!n.createdBy?.platformRole;
            return (
              <div key={n.id} className={`rounded-lg border px-3 py-2 text-sm ${staff ? 'border-accent/30 bg-accent-tint/40' : 'border-line bg-surface-2 dark:border-dark-line dark:bg-dark-raised'}`}>
                <div className="mb-0.5 text-xs text-ink-faint dark:text-dark-ink-faint">
                  {n.createdBy ? `${n.createdBy.firstName} ${n.createdBy.lastName}` : '—'}{staff ? ' (Northstack)' : ''} · {date(n.createdAt)}
                </div>
                <div className="whitespace-pre-wrap">{n.description}</div>
              </div>
            );
          })}
          <form onSubmit={sendReply} className="grid gap-2">
            <label htmlFor="fb-reply" className="text-sm font-medium">{kind === 'tickets' ? 'Responder' : 'Nueva nota'}</label>
            <textarea id="fb-reply" rows={4} value={reply} onChange={(e) => setReply(e.target.value)} />
            <div><button type="submit" className="btn-primary" disabled={busy || !reply.trim()}>{busy ? 'Enviando…' : kind === 'tickets' ? 'Enviar respuesta' : 'Guardar nota'}</button></div>
          </form>
        </div>
      </Panel>
    </div>
  );
}
