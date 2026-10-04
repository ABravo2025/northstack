import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Modal from '../components/common/Modal';
import { adminActions, type ClientDetail } from './adminApi';
import type { AdminSession } from './AdminApp';
import { date } from './format';

// Admin Center v2, stage 2a: the "Acciones" menu on the client page. Every action asks for a
// reason (it lands in the Registro de acciones and the client's Actividad tab).

type ActionKey = 'extend' | 'plan' | 'suspend' | 'reactivate';

interface Props {
  client: ClientDetail;
  session: AdminSession;
  onDone: (message: string) => void;
}

export default function ClientActions({ client, session, onDone }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [action, setAction] = useState<ActionKey | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isAdmin = session.role === 'platform_admin';
  const hasProvider = !!client.subscription?.provider;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const items: { key: ActionKey; label: string; hint: string; show: boolean; tone?: string }[] = [
    { key: 'extend', label: 'Extender prueba', hint: hasProvider ? 'No disponible: ya cargó medio de pago' : 'Suma días a la prueba gratis', show: client.status !== 'cancelled' },
    { key: 'plan', label: 'Cambiar plan', hint: 'Starter ↔ Growth', show: isAdmin && client.status !== 'cancelled' },
    { key: 'suspend', label: 'Suspender cuenta', hint: 'Queda en solo lectura', show: isAdmin && client.status !== 'suspended' && client.status !== 'cancelled', tone: 'text-amber-700 dark:text-amber-300' },
    { key: 'reactivate', label: 'Reactivar cuenta', hint: 'Vuelven a poder trabajar', show: isAdmin && client.status === 'suspended' },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button type="button" className="btn-primary" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
        Acciones ▾
      </button>
      {menuOpen && (
        <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-30 w-64 rounded-lg border border-line bg-surface-1 p-1.5 shadow-xl dark:border-dark-line dark:bg-dark-surface">
          {items.filter((i) => i.show).map((i) => (
            <button
              key={i.key}
              type="button"
              role="menuitem"
              disabled={i.key === 'extend' && hasProvider}
              onClick={() => { setMenuOpen(false); setAction(i.key); }}
              className={`block w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-dark-raised ${i.tone ?? ''}`}
            >
              {i.label}
              <span className="block text-xs text-ink-faint dark:text-dark-ink-faint">{i.hint}</span>
            </button>
          ))}
        </div>
      )}
      {action && <ActionDialog action={action} client={client} session={session} onClose={() => setAction(null)} onDone={(m) => { setAction(null); onDone(m); }} />}
    </div>
  );
}

function ActionDialog({ action, client, session, onClose, onDone }: { action: ActionKey; client: ClientDetail; session: AdminSession; onClose: () => void; onDone: (m: string) => void }) {
  const [reason, setReason] = useState('');
  const [days, setDays] = useState(7);
  const [plan, setPlan] = useState<'starter' | 'growth'>(client.plan === 'growth' ? 'starter' : 'growth');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titles: Record<ActionKey, string> = {
    extend: 'Extender prueba',
    plan: 'Cambiar plan',
    suspend: 'Suspender cuenta',
    reactivate: 'Reactivar cuenta',
  };
  let body: ReactNode = null;
  if (action === 'extend') {
    body = (
      <>
        <p className="text-sm text-ink-muted dark:text-dark-ink-muted">
          {client.trialEndsAt ? `Hoy vence el ${date(client.trialEndsAt)}.` : 'No tiene fecha de prueba.'} Si ya venció, se cuenta desde hoy y la cuenta vuelve a "En prueba".
        </p>
        <label className="grid gap-1 text-sm font-medium" htmlFor="act-days">
          Días a sumar
          <select id="act-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} días</option>)}
          </select>
        </label>
      </>
    );
  } else if (action === 'plan') {
    body = (
      <>
        <p className="text-sm text-ink-muted dark:text-dark-ink-muted">
          {client.subscription?.provider
            ? 'Paga con tarjeta: si sube a Growth se cobra la diferencia ahora; si baja a Starter, el cambio se aplica en el próximo cobro.'
            : 'Todavía no paga: solo cambia el plan elegido. Se cobra cuando cargue un medio de pago.'}
        </p>
        <label className="grid gap-1 text-sm font-medium" htmlFor="act-plan">
          Plan nuevo
          <select id="act-plan" value={plan} onChange={(e) => setPlan(e.target.value as 'starter' | 'growth')}>
            <option value="growth">Growth</option>
            <option value="starter">Starter</option>
          </select>
        </label>
      </>
    );
  } else if (action === 'suspend') {
    body = (
      <p className="text-sm text-ink-muted dark:text-dark-ink-muted">
        La cuenta queda en <b>solo lectura</b>: pueden entrar y ver, pero no crear ni cambiar nada.
        {client.subscription?.provider && ' Ojo: tiene un medio de pago, así que el proveedor sigue cobrando hasta que cancele.'}
      </p>
    );
  } else {
    body = <p className="text-sm text-ink-muted dark:text-dark-ink-muted">Vuelven a poder trabajar normalmente.</p>;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setError('Escribí un motivo. Queda en el registro de acciones.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = reason.trim();
      const res =
        action === 'extend' ? await adminActions.extendTrial(session.token, client.id, days, r)
        : action === 'plan' ? await adminActions.changePlan(session.token, client.id, plan, r)
        : action === 'suspend' ? await adminActions.suspend(session.token, client.id, r)
        : await adminActions.reactivate(session.token, client.id, r);
      onDone(res.message ?? 'Listo.');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={`${titles[action]} · ${client.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" form="admin-action-form" className="btn-primary" disabled={busy}>{busy ? 'Guardando…' : titles[action]}</button>
        </>
      }
    >
      <form id="admin-action-form" onSubmit={submit} className="grid gap-3">
        {body}
        <label className="grid gap-1 text-sm font-medium" htmlFor="act-reason">
          Motivo (queda en el registro)
          <input id="act-reason" autoFocus value={reason} onChange={(e) => { setReason(e.target.value); setError(null); }} placeholder="Ej.: lo pidió el cliente por mail" />
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </form>
    </Modal>
  );
}

// Per-user "Restablecer contraseña" (Users tab).
export function ResetPasswordButton({ client, user, session, onDone }: { client: ClientDetail; user: { id: string; name: string; email: string }; session: AdminSession; onDone: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setError('Escribí un motivo. Queda en el registro de acciones.');
      return;
    }
    setBusy(true);
    try {
      const res = await adminActions.resetPassword(session.token, client.id, user.id, reason.trim());
      setOpen(false);
      setReason('');
      onDone(res.message ?? 'Listo.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>Restablecer contraseña</button>
      {open && (
        <Modal
          open
          title={`Restablecer contraseña · ${user.name}`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
              <button type="submit" form="admin-reset-form" className="btn-primary" disabled={busy}>{busy ? 'Enviando…' : 'Mandar link'}</button>
            </>
          }
        >
          <form id="admin-reset-form" onSubmit={submit} className="grid gap-3">
            <p className="text-sm text-ink-muted dark:text-dark-ink-muted">Le llega a <b>{user.email}</b> un link para elegir una contraseña nueva. Nadie de Northstack ve la contraseña.</p>
            <label className="grid gap-1 text-sm font-medium" htmlFor="reset-reason">
              Motivo (queda en el registro)
              <input id="reset-reason" autoFocus value={reason} onChange={(e) => { setReason(e.target.value); setError(null); }} placeholder="Ej.: no puede entrar, lo pidió por WhatsApp" />
            </label>
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </form>
        </Modal>
      )}
    </>
  );
}
