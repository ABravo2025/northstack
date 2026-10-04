import { useCallback, useEffect, useState } from 'react';
import { supportApi, type ClientDetail, type SupportRequest } from './adminApi';
import type { AdminSession } from './AdminApp';
import { Chip } from './ui';

// Admin Center v2, stage 5: the current support-access request for this client (if any) on the
// client page — waiting for the customer, active (with "Entrar como soporte"), or how it ended.

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const DURATION: Record<number, string> = { 30: '30 minutos', 120: '2 horas', 1440: '24 horas' };

export default function SupportAccessPanel({ client, session, refreshKey, onDone }: { client: ClientDetail; session: AdminSession; refreshKey: number; onDone: (m: string) => void }) {
  const [rows, setRows] = useState<SupportRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    supportApi.list(session.token, client.id).then(setRows).catch(() => setRows([]));
  }, [session.token, client.id]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 20_000); // notices the customer's answer without reloading
    return () => window.clearInterval(id);
  }, [load, refreshKey]);

  const current = rows.find((r) => r.status === 'pending' || r.status === 'approved');
  const last = rows[0];
  if (!current && !last) return null;

  const enter = async (r: SupportRequest) => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await supportApi.enter(session.token, client.id, r.id);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const end = async (r: SupportRequest) => {
    setBusy(true);
    try {
      const res = await supportApi.end(session.token, client.id, r.id);
      onDone(res.message ?? 'Listo.');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (current?.status === 'pending') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-sky-50 px-4 py-2.5 text-sm text-sky-900 dark:bg-sky-950/50 dark:text-sky-200">
        <span><b>Acceso de soporte pendiente.</b> Esperando que {current.target.name} ({current.target.email}) acepte · {current.mode === 'edit' ? 'ver y editar' : 'solo lectura'} · {DURATION[current.durationMinutes]}. Vence {fmt(current.requestExpiresAt)}.</span>
        <button type="button" className="btn-secondary ml-auto" disabled={busy} onClick={() => end(current)}>Cancelar pedido</button>
        {error && <span className="w-full text-rose-600">{error}</span>}
      </div>
    );
  }
  if (current?.status === 'approved') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
        <span><b>{current.target.name} aceptó el acceso.</b> {current.mode === 'edit' ? 'Ver y editar' : 'Solo lectura'} hasta {fmt(current.accessEndsAt)}. Puede terminarlo cuando quiera.</span>
        <span className="ml-auto flex gap-2">
          <button type="button" className="btn-primary" disabled={busy} onClick={() => enter(current)}>Entrar como soporte</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => end(current)}>Terminar acceso</button>
        </span>
        {error && <span className="w-full text-rose-600">{error}</span>}
      </div>
    );
  }
  // Nothing active: just how the last one ended, for a day.
  if (last && Date.now() - new Date(last.endedAt ?? last.decidedAt ?? last.createdAt).getTime() < 24 * 3600 * 1000) {
    const label: Record<string, string> = { rejected: 'rechazó el pedido', expired: 'no respondió a tiempo (venció)', ended: last.endedBy === 'customer' ? 'terminó el acceso' : 'el acceso terminó' };
    return (
      <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-4 py-2 text-sm text-ink-muted dark:bg-dark-raised dark:text-dark-ink-muted">
        <Chip tone="neutral" dot={false}>Soporte</Chip> {last.target.name} {label[last.status] ?? last.status} · {fmt(last.endedAt ?? last.decidedAt ?? last.createdAt)}
      </div>
    );
  }
  return null;
}
