import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import TableBody from '../components/common/TableBody';
import { AdminApiError, adminActions, type AuditEntry } from './adminApi';
import type { AdminSession } from './AdminApp';
import { ErrorBox, Loading } from './ui';

// Admin Center v2: every action Northstack staff took on a client, with its reason. Read-only.

const ACTION_LABEL: Record<string, string> = {
  extend_trial: 'Extendió la prueba',
  change_plan: 'Cambió el plan',
  suspend: 'Suspendió la cuenta',
  reactivate: 'Reactivó la cuenta',
  reset_password: 'Mandó link de contraseña nueva',
};

function detailText(e: AuditEntry): string {
  const d = e.details ?? {};
  if (e.action === 'extend_trial' && typeof d.days === 'number') return `+${d.days} días, hasta ${String(d.to).slice(0, 10)}`;
  if (e.action === 'change_plan') return `${d.from ?? 'sin plan'} → ${d.to}`;
  if (e.action === 'reset_password' && d.email) return String(d.email);
  return '';
}

export default function AdminAudit({ session }: { session: AdminSession }) {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminActions
      .audit(session.token)
      .then(setRows)
      .catch((e) => (e instanceof AdminApiError && e.status === 401 ? session.onUnauthorized() : setError(e.message)));
  }, [session]);

  if (error) return <ErrorBox message={error} />;
  if (!rows) return <Loading />;

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-xl font-semibold">Registro de acciones</h2>
        <p className="mt-1 text-sm text-ink-muted dark:text-dark-ink-muted">Todo lo que el equipo hizo sobre un cliente, con su motivo. No se puede editar ni borrar.</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface-1 dark:border-dark-line dark:bg-dark-surface">
        <table className="table w-full">
          <thead><tr><th>Cuándo</th><th>Quién</th><th>Acción</th><th>Cliente</th><th>Motivo</th></tr></thead>
          <TableBody colSpan={5} isEmpty={rows.length === 0} empty={{ title: 'Todavía no hay acciones registradas.' }}>
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap tabular-nums">{new Date(e.createdAt).toLocaleString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                <td>{e.actor}</td>
                <td>
                  <div className="font-semibold">{ACTION_LABEL[e.action] ?? e.action}</div>
                  {detailText(e) && <div className="text-xs text-ink-faint dark:text-dark-ink-faint">{detailText(e)}</div>}
                </td>
                <td>{e.tenant ? <Link to={`/clients/${e.tenant.id}`} className="text-accent hover:underline dark:text-brand-blue-light">{e.tenant.name}</Link> : '—'}</td>
                <td className="text-ink-muted dark:text-dark-ink-muted">{e.reason}</td>
              </tr>
            ))}
          </TableBody>
        </table>
      </div>
    </div>
  );
}
