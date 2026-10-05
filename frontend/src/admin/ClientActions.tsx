import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Modal from '../components/common/Modal';
import { adminActions, supportApi, type ClientDetail } from './adminApi';
import type { AdminSession } from './AdminApp';
import { date } from './format';

// Admin Center v2, stage 2a: the "Acciones" menu on the client page. Every action asks for a
// reason (it lands in the Registro de acciones and the client's Actividad tab).

type ActionKey = 'extend' | 'plan' | 'suspend' | 'reactivate' | 'freeMonths' | 'reminder' | 'export' | 'support' | 'delete' | 'cancelDelete';

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
  const isDodo = client.subscription?.provider === 'dodopayments';

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const deleting = !!client.deletionScheduledAt;
  const activeUsers = client.users.filter((u) => u.status === 'active');
  const items: { key: ActionKey; label: string; hint: string; show: boolean; tone?: string }[] = [
    { key: 'support', label: 'Pedir acceso de soporte', hint: 'La persona tiene que aceptarlo', show: !deleting && activeUsers.length > 0 },
    { key: 'extend', label: 'Extender prueba', hint: hasProvider ? 'No disponible: ya cargó medio de pago' : 'Suma días a la prueba gratis', show: client.status !== 'cancelled' },
    { key: 'plan', label: 'Cambiar plan', hint: 'Starter ↔ Growth', show: isAdmin && client.status !== 'cancelled' },
    { key: 'freeMonths', label: 'Cambiar fecha del próximo cobro', hint: isDodo ? 'Para dar meses gratis o acomodar el cobro' : 'Solo para clientes que pagan con Dodo', show: isAdmin && hasProvider },
    { key: 'reminder', label: 'Pedir que actualice la tarjeta', hint: 'Le manda un mail con el link a Facturación', show: hasProvider },
    { key: 'export', label: 'Exportar datos del cliente', hint: 'ZIP con un CSV por módulo', show: isAdmin },
    { key: 'suspend', label: 'Suspender cuenta', hint: 'Queda en solo lectura', show: isAdmin && client.status !== 'suspended' && client.status !== 'cancelled', tone: 'text-amber-700 dark:text-amber-300' },
    { key: 'reactivate', label: 'Reactivar cuenta', hint: 'Vuelven a poder trabajar', show: isAdmin && client.status === 'suspended' },
    { key: 'delete', label: 'Eliminar cliente', hint: 'Bloquea ya; borra los datos a los 10 días', show: isAdmin && !deleting, tone: 'text-rose-600' },
    { key: 'cancelDelete', label: 'Cancelar eliminación', hint: 'El cliente vuelve a poder entrar', show: isAdmin && deleting },
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
              disabled={(i.key === 'extend' && hasProvider) || (i.key === 'freeMonths' && !isDodo)}
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
  const nextBase = client.nextChargeAt ? new Date(client.nextChargeAt) : new Date();
  const plusMonths = (n: number) => {
    const d = new Date(nextBase.getTime());
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + n);
    d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
    return d.toISOString().slice(0, 10);
  };
  const [chargeDate, setChargeDate] = useState(plusMonths(1));
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const inAYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  const activeUsers = client.users.filter((u) => u.status === 'active');
  const [targetUserId, setTargetUserId] = useState(activeUsers.find((u) => u.role === 'owner')?.id ?? activeUsers[0]?.id ?? '');
  const [supportMode, setSupportMode] = useState<'read_only' | 'edit'>('read_only');
  const [duration, setDuration] = useState(30);
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titles: Record<ActionKey, string> = {
    extend: 'Extender prueba',
    plan: 'Cambiar plan',
    suspend: 'Suspender cuenta',
    reactivate: 'Reactivar cuenta',
    freeMonths: 'Cambiar fecha del próximo cobro',
    reminder: 'Pedir que actualice la tarjeta',
    export: 'Exportar datos',
    support: 'Pedir acceso de soporte',
    delete: 'Eliminar cliente',
    cancelDelete: 'Cancelar eliminación',
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
  } else if (action === 'freeMonths') {
    const later = !client.nextChargeAt || chargeDate > client.nextChargeAt.slice(0, 10);
    body = (
      <>
        <p className="text-sm text-ink-muted dark:text-dark-ink-muted">
          Hoy el próximo cobro es el <b>{date(client.nextChargeAt)}</b>. Elegí la fecha nueva: no se cobra nada hasta ese día y después sigue normal, con el mismo precio y la misma tarjeta. Se cambia en Dodo al instante.
        </p>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((n) => (
            <button key={n} type="button" className="btn-secondary" onClick={() => setChargeDate(plusMonths(n))}>+{n} {n === 1 ? 'mes' : 'meses'}</button>
          ))}
        </div>
        <label className="grid gap-1 text-sm font-medium" htmlFor="act-charge-date">
          Fecha del próximo cobro
          <input id="act-charge-date" type="date" min={tomorrow} max={inAYear} value={chargeDate} onChange={(e) => setChargeDate(e.target.value)} />
        </label>
        {!later && <p className="m-0 text-sm text-amber-700 dark:text-amber-300">Es antes que la fecha actual: el cobro se adelanta.</p>}
      </>
    );
  } else if (action === 'reminder') {
    body = (
      <p className="text-sm text-ink-muted dark:text-dark-ink-muted">
        Le llega al dueño ({client.owner?.email ?? '—'}) un mail en su idioma con el link a Configuración → Facturación. Ni Dodo ni Mercado Pago permiten forzar un reintento: el cobro se reintenta solo cuando actualiza la tarjeta.
      </p>
    );
  } else if (action === 'support') {
    body = (
      <>
        <p className="text-sm text-ink-muted dark:text-dark-ink-muted">
          Le llega un pedido a esa persona: un aviso dentro de Northstack y un mail. Recién cuando lo acepta podés entrar, viendo lo mismo que ella con sus permisos. Puede terminar el acceso cuando quiera. <b>El motivo lo ve el cliente.</b>
        </p>
        <label className="grid gap-1 text-sm font-medium" htmlFor="act-target">
          ¿A quién le pedís permiso?
          <select id="act-target" value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}>
            {activeUsers.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}{u.role === 'owner' ? ' (dueño)' : ''}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-sm font-medium" htmlFor="act-mode">
            Modo
            <select id="act-mode" value={supportMode} onChange={(e) => setSupportMode(e.target.value as 'read_only' | 'edit')}>
              <option value="read_only">Solo lectura (recomendado)</option>
              <option value="edit">Ver y editar</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium" htmlFor="act-duration">
            Duración (desde que acepta)
            <select id="act-duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              <option value={30}>30 minutos</option>
              <option value={120}>2 horas</option>
              <option value={1440}>24 horas</option>
            </select>
          </label>
        </div>
      </>
    );
  } else if (action === 'delete') {
    body = (
      <>
        <p className="text-sm text-ink-muted dark:text-dark-ink-muted">
          Desde que confirmás, <b>nadie de {client.name} puede entrar</b> y se cierran sus sesiones. <b>A los 10 días se borran todos sus datos, sin vuelta atrás.</b> Hasta entonces lo podés deshacer con "Cancelar eliminación". Al dueño le llega un mail avisando. Si tiene una suscripción paga activa, primero hay que cancelarla.
        </p>
        <label className="grid gap-1 text-sm font-medium" htmlFor="act-confirm">
          Escribí el nombre de la empresa para confirmar
          <input id="act-confirm" autoComplete="off" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={client.name} />
        </label>
      </>
    );
  } else if (action === 'cancelDelete') {
    body = <p className="text-sm text-ink-muted dark:text-dark-ink-muted">La cuenta se desbloquea y vuelven a poder entrar con sus usuarios de siempre.</p>;
  } else if (action === 'export') {
    body = (
      <p className="text-sm text-ink-muted dark:text-dark-ink-muted">
        Se descarga un ZIP con personas, empresas, contactos, usuarios, ausencias, oportunidades y tareas (un CSV por módulo). Tiene datos personales: queda registrado quién lo bajó y por qué.
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
      if (action === 'export') {
        const { blob, filename } = await adminActions.exportData(session.token, client.id, r);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        onDone(`Descargado: ${filename}`);
        return;
      }
      if (action === 'delete' && confirmName.trim() !== client.name.trim()) {
        setError('El nombre no coincide.');
        setBusy(false);
        return;
      }
      const res =
        action === 'support' ? await supportApi.request(session.token, client.id, { targetUserId, mode: supportMode, durationMinutes: duration, reason: r })
        : action === 'delete' ? await supportApi.scheduleDelete(session.token, client.id, confirmName, r)
        : action === 'cancelDelete' ? await supportApi.cancelDelete(session.token, client.id, r)
        : action === 'freeMonths' ? await adminActions.nextChargeDate(session.token, client.id, chargeDate, r)
        : action === 'reminder' ? await adminActions.paymentReminder(session.token, client.id, r)
        : action === 'extend' ? await adminActions.extendTrial(session.token, client.id, days, r)
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
