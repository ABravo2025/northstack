import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Modal from '../components/common/Modal';
import TableBody from '../components/common/TableBody';
import { AdminApiError, adminApi, announcementsApi, type AdminAnnouncement, type ClientRow } from './adminApi';
import type { AdminSession } from './AdminApp';
import { Chip, ErrorBox, Loading } from './ui';

// Admin Center v2, stage 4: in-app announcements (the bell's "Novedades"), written here instead of
// by script. English required, Spanish optional, audience and optional schedule.

const PLAN_OPTS = [
  { key: 'trial', label: 'En prueba / sin plan' },
  { key: 'starter', label: 'Starter' },
  { key: 'growth', label: 'Growth' },
];
const POLICY_LABEL: Record<string, string> = { terms_of_service: 'Términos y condiciones', privacy_policy: 'Política de privacidad', refund_policy: 'Política de reembolsos' };

function audienceText(a: AdminAnnouncement): string {
  const parts: string[] = [];
  if (a.targetPlans.length) parts.push(a.targetPlans.map((p) => PLAN_OPTS.find((o) => o.key === p)?.label ?? p).join(', '));
  if (a.targetCountries.length) parts.push(a.targetCountries.join(', '));
  if (a.targetTenants.length) parts.push(a.targetTenants.map((t) => t.name).join(', '));
  return parts.length ? parts.join(' · ') : 'Todos';
}

const fmt = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function AdminAnnouncements({ session }: { session: AdminSession }) {
  const [rows, setRows] = useState<AdminAnnouncement[] | null>(null);
  const [countries, setCountries] = useState<string[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminAnnouncement | 'new' | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const isAdmin = session.role === 'platform_admin';

  const load = useCallback(() => {
    announcementsApi
      .list(session.token)
      .then((r) => { setRows(r.announcements); setCountries(r.countries); })
      .catch((e) => (e instanceof AdminApiError && e.status === 401 ? session.onUnauthorized() : setError(e.message)));
  }, [session]);

  useEffect(() => {
    load();
    adminApi.clients(session.token).then(setClients).catch(() => setClients([]));
  }, [load, session.token]);

  if (error) return <ErrorBox message={error} />;
  if (!rows) return <Loading />;

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-xl font-semibold">Anuncios</h2>
        <p className="mt-1 text-sm text-ink-muted dark:text-dark-ink-muted">Las novedades que ven los clientes en la campanita de la app</p>
      </div>
      {flash && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" role="status">
          <span>{flash}</span>
          <button type="button" className="text-xs underline" onClick={() => setFlash(null)}>Cerrar</button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-line bg-surface-1 dark:border-dark-line dark:bg-dark-surface">
        <table className="table w-full">
          <thead><tr><th>Anuncio</th><th>Tipo</th><th>Para quién</th><th>Publicación</th><th style={{ textAlign: 'right' }}>Lo leyeron</th></tr></thead>
          <TableBody colSpan={5} isEmpty={rows.length === 0} empty={{ title: 'Todavía no hay anuncios.' }} onAdd={isAdmin ? () => setEditing('new') : undefined} addLabel="Nuevo anuncio">
            {rows.map((a) => (
              <tr key={a.id} className={isAdmin ? 'cursor-pointer' : ''} onClick={() => isAdmin && setEditing(a)}>
                <td>
                  <div className="font-semibold">{a.titleEs || a.title}</div>
                  <div className="text-xs text-ink-faint dark:text-dark-ink-faint">{a.summaryEs || a.summary}</div>
                  {!a.titleEs && <span className="mt-1 inline-block"><Chip tone="neutral" dot={false}>solo en inglés</Chip></span>}
                </td>
                <td>{a.type === 'policy_change' ? <Chip tone="warn" dot={false}>{POLICY_LABEL[a.policyType ?? ''] ?? 'Política'}</Chip> : <Chip tone="accent" dot={false}>Novedad</Chip>}</td>
                <td className="max-w-[260px] text-sm">{audienceText(a)}</td>
                <td className="whitespace-nowrap tabular-nums">{a.scheduled ? <Chip tone="info">Programado: {fmt(a.publishedAt)}</Chip> : fmt(a.publishedAt)}</td>
                <td className="text-right tabular-nums">{a.scheduled ? '—' : `${a.read} de ${a.reach}`}</td>
              </tr>
            ))}
          </TableBody>
        </table>
      </div>
      {editing && (
        <AnnouncementDialog
          initial={editing === 'new' ? null : editing}
          countries={countries}
          clients={clients}
          session={session}
          onClose={() => setEditing(null)}
          onDone={(m) => { setEditing(null); setFlash(m); load(); }}
        />
      )}
    </div>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AnnouncementDialog({ initial, countries, clients, session, onClose, onDone }: {
  initial: AdminAnnouncement | null;
  countries: string[];
  clients: ClientRow[];
  session: AdminSession;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const published = !!initial && !initial.scheduled;
  const [type, setType] = useState(initial?.type ?? 'feature_update');
  const [policyType, setPolicyType] = useState(initial?.policyType ?? 'privacy_policy');
  const [es, setEs] = useState({ title: initial?.titleEs ?? '', summary: initial?.summaryEs ?? '', body: initial?.bodyEs ?? '' });
  const [en, setEn] = useState({ title: initial?.title ?? '', summary: initial?.summary ?? '', body: initial?.body ?? '' });
  const [plans, setPlans] = useState<string[]>(initial?.targetPlans ?? []);
  const [ctry, setCtry] = useState<string[]>(initial?.targetCountries ?? []);
  const [tenantIds, setTenantIds] = useState<string[]>(initial?.targetTenantIds ?? []);
  const [clientQuery, setClientQuery] = useState('');
  const [when, setWhen] = useState(initial?.scheduled ? toLocalInput(initial.publishedAt) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const matches = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    return q ? clients.filter((c) => c.name.toLowerCase().includes(q) && !tenantIds.includes(c.id)).slice(0, 6) : [];
  }, [clientQuery, clients, tenantIds]);
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      type,
      policyType: type === 'policy_change' ? policyType : null,
      title: en.title, summary: en.summary, body: en.body,
      titleEs: es.title, summaryEs: es.summary, bodyEs: es.body,
      targetPlans: plans, targetCountries: ctry, targetTenantIds: tenantIds,
      publishAt: when ? new Date(when).toISOString() : '',
    };
    try {
      const res = initial ? await announcementsApi.update(session.token, initial.id, body) : await announcementsApi.create(session.token, body);
      onDone(res.message ?? 'Listo.');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!initial) return;
    setBusy(true);
    try {
      const res = await announcementsApi.remove(session.token, initial.id);
      onDone(res.message ?? 'Borrado.');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const textFields = (lang: 'es' | 'en') => {
    const v = lang === 'es' ? es : en;
    const set = lang === 'es' ? setEs : setEn;
    return (
      <fieldset className="grid gap-2 rounded-lg border border-line p-3 dark:border-dark-line">
        <legend className="px-1 text-sm font-semibold">{lang === 'es' ? 'Español (opcional)' : 'Inglés (obligatorio)'}</legend>
        <label className="grid gap-1 text-sm font-medium" htmlFor={`an-title-${lang}`}>Título<input id={`an-title-${lang}`} value={v.title} maxLength={140} onChange={(e) => set({ ...v, title: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-medium" htmlFor={`an-sum-${lang}`}>Resumen (una línea, se ve en la campanita)<input id={`an-sum-${lang}`} value={v.summary} maxLength={280} onChange={(e) => set({ ...v, summary: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-medium" htmlFor={`an-body-${lang}`}>Texto completo<textarea id={`an-body-${lang}`} rows={4} value={v.body} onChange={(e) => set({ ...v, body: e.target.value })} /></label>
      </fieldset>
    );
  };

  return (
    <Modal
      open
      wide
      title={initial ? 'Editar anuncio' : 'Nuevo anuncio'}
      onClose={onClose}
      footer={
        <>
          {initial && !confirmDelete && <button type="button" className="btn-secondary mr-auto text-rose-600" onClick={() => setConfirmDelete(true)}>Borrar</button>}
          {confirmDelete && (
            <span className="mr-auto flex items-center gap-2 text-sm">
              ¿Borrarlo? Deja de verse en la app.
              <button type="button" className="btn-secondary" onClick={remove} disabled={busy}>Sí, borrar</button>
              <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>No</button>
            </span>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" form="announcement-form" className="btn-primary" disabled={busy}>{busy ? 'Guardando…' : initial ? 'Guardar' : when ? 'Programar' : 'Publicar'}</button>
        </>
      }
    >
      <form id="announcement-form" onSubmit={submit} className="grid gap-4">
        <div className="flex flex-wrap gap-4">
          <label className="grid gap-1 text-sm font-medium" htmlFor="an-type">
            Tipo
            <select id="an-type" value={type} disabled={!!initial} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="feature_update">Novedad</option>
              <option value="policy_change">Cambio de política (también manda mail)</option>
            </select>
          </label>
          {type === 'policy_change' && (
            <label className="grid gap-1 text-sm font-medium" htmlFor="an-policy">
              Política
              <select id="an-policy" value={policyType} disabled={!!initial} onChange={(e) => setPolicyType(e.target.value as typeof policyType)}>
                {Object.entries(POLICY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
          )}
          {type !== 'policy_change' && !published && (
            <label className="grid gap-1 text-sm font-medium" htmlFor="an-when">
              Publicar
              <input id="an-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              <span className="text-xs font-normal text-ink-faint dark:text-dark-ink-faint">Vacío = ahora</span>
            </label>
          )}
        </div>
        {type === 'policy_change' && !initial && (
          <p className="m-0 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">Al publicarlo se manda un mail a cada persona a la que va dirigido. Se publica en el momento.</p>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {textFields('es')}
          {textFields('en')}
        </div>
        <fieldset className="grid gap-3 rounded-lg border border-line p-3 dark:border-dark-line">
          <legend className="px-1 text-sm font-semibold">Para quién (sin marcar nada = todos)</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="font-medium">Plan:</span>
            {PLAN_OPTS.map((p) => (
              <label key={p.key} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={plans.includes(p.key)} onChange={() => setPlans(toggle(plans, p.key))} /> {p.label}</label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">País:</span>
            {countries.map((c) => (
              <button key={c} type="button" aria-pressed={ctry.includes(c)} onClick={() => setCtry(toggle(ctry, c))} className={`rounded-full border px-2.5 py-0.5 ${ctry.includes(c) ? 'border-accent bg-accent-tint font-semibold text-accent dark:text-brand-blue-light' : 'border-line dark:border-dark-line'}`}>{c}</button>
            ))}
          </div>
          <div className="grid gap-2 text-sm">
            <span className="font-medium">Clientes puntuales:</span>
            <div className="flex flex-wrap gap-1.5">
              {tenantIds.map((id) => (
                <button key={id} type="button" onClick={() => setTenantIds(tenantIds.filter((x) => x !== id))} className="rounded-full border border-accent bg-accent-tint px-2.5 py-0.5 text-accent dark:text-brand-blue-light" title="Quitar">
                  {clients.find((c) => c.id === id)?.name ?? initial?.targetTenants.find((t) => t.id === id)?.name ?? id} ✕
                </button>
              ))}
            </div>
            <input value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} placeholder="Buscar cliente para agregar…" aria-label="Buscar cliente" className="max-w-sm" />
            {matches.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {matches.map((c) => <button key={c.id} type="button" className="btn-secondary" onClick={() => { setTenantIds([...tenantIds, c.id]); setClientQuery(''); }}>+ {c.name}</button>)}
              </div>
            )}
          </div>
        </fieldset>
        {error && <p className="m-0 text-sm text-rose-600">{error}</p>}
      </form>
    </Modal>
  );
}
