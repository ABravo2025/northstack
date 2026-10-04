import { useState, type FormEvent } from 'react';
import { adminActions, type AgreementLimit, type AgreementModule, type ClientDetail } from './adminApi';
import type { AdminSession } from './AdminApp';
import { date } from './format';
import { Chip, Panel } from './ui';

// Admin Center v2, stage 2b: "Módulos y límites" — a per-client agreement on top of the plan.
// What the backend enforces lives in planLimits.ts (PlanOverride); this only edits it.

const MODULES: { key: AgreementModule; flag: 'payrollEnabled' | 'paymentsEnabled' | 'apiAccessEnabled'; label: string; hint: string }[] = [
  { key: 'payroll', flag: 'payrollEnabled', label: 'Nómina', hint: 'Liquidaciones y recibos (seguimiento)' },
  { key: 'payments', flag: 'paymentsEnabled', label: 'Pagos', hint: 'Cobros con Stripe' },
  { key: 'apiAccess', flag: 'apiAccessEnabled', label: 'API, webhooks e IA (MCP)', hint: 'Integraciones externas' },
];

const LIMITS: { key: AgreementLimit; label: string; unlimitedOk: boolean }[] = [
  { key: 'maxPipelines', label: 'Pipelines de ventas', unlimitedOk: true },
  { key: 'maxTimeOffPolicies', label: 'Políticas de ausencia', unlimitedOk: true },
  { key: 'maxCustomRoles', label: 'Roles a medida', unlimitedOk: true },
  { key: 'activityLogRetentionDays', label: 'Historial del registro de actividad (días)', unlimitedOk: true },
  { key: 'freeTrialSeatCap', label: 'Usuarios durante la prueba (sin plan)', unlimitedOk: false },
];

type ModuleChoice = 'plan' | 'on' | 'off';
type LimitChoice = string; // '' = the plan, 'unlimited', or a number

const limitLabel = (v: number | null) => (v === null ? 'Sin límite' : String(v));

export default function AgreementTab({ c, session, onDone }: { c: ClientDetail; session: AdminSession; onDone: (m: string) => void }) {
  const a = c.agreement;
  const isAdmin = session.role === 'platform_admin';
  const [mods, setMods] = useState<Record<AgreementModule, ModuleChoice>>(() => {
    const out = {} as Record<AgreementModule, ModuleChoice>;
    for (const m of MODULES) out[m.key] = a?.modules[m.key] === undefined ? 'plan' : a.modules[m.key] ? 'on' : 'off';
    return out;
  });
  const [lims, setLims] = useState<Record<AgreementLimit, LimitChoice>>(() => {
    const out = {} as Record<AgreementLimit, LimitChoice>;
    for (const l of LIMITS) {
      const v = a?.limits[l.key];
      out[l.key] = v === undefined ? '' : v === null ? 'unlimited' : String(v);
    }
    return out;
  });
  const [expiresAt, setExpiresAt] = useState(a?.expiresAt ?? '');
  const [reason, setReason] = useState(a?.reason ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const resulting = (m: (typeof MODULES)[number]) => (mods[m.key] === 'plan' ? c.planLimits[m.flag] : mods[m.key] === 'on');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setError('Escribí el acuerdo o motivo. Queda en el registro.');
      return;
    }
    for (const l of LIMITS) {
      const v = lims[l.key];
      if (v !== '' && v !== 'unlimited' && !/^\d+$/.test(v)) {
        setError(`"${l.label}" tiene que ser un número entero.`);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const modules: Record<string, boolean | 'plan'> = {};
      for (const m of MODULES) modules[m.key] = mods[m.key] === 'plan' ? 'plan' : mods[m.key] === 'on';
      const limits: Record<string, number | null | 'plan'> = {};
      for (const l of LIMITS) {
        const v = lims[l.key];
        limits[l.key] = v === '' ? 'plan' : v === 'unlimited' ? null : Number(v);
      }
      const res = await adminActions.setAgreement(session.token, c.id, { modules, limits, expiresAt: expiresAt || null, reason: reason.trim() });
      onDone(res.message ?? 'Acuerdo guardado.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (reason.trim().length < 3) {
      setError('Escribí por qué se quita el acuerdo. Queda en el registro.');
      return;
    }
    setBusy(true);
    try {
      const res = await adminActions.clearAgreement(session.token, c.id, reason.trim());
      onDone(res.message ?? 'Acuerdo quitado.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setConfirmClear(false);
    }
  };

  return (
    <form onSubmit={save} className="grid gap-4">
      {a && (
        <div className={`rounded-lg px-4 py-2.5 text-sm ${a.active ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200' : 'bg-surface-2 text-ink-muted dark:bg-dark-raised dark:text-dark-ink-muted'}`}>
          <b>{a.active ? 'Acuerdo especial vigente.' : 'Acuerdo vencido (ya no aplica).'}</b> {a.reason}
          {a.expiresAt ? ` · ${a.active ? 'vence' : 'venció'} el ${date(a.expiresAt + 'T12:00:00Z')}` : ' · sin vencimiento'} · guardado el {date(a.setAt)}
        </div>
      )}
      {!isAdmin && <p className="text-sm text-ink-muted dark:text-dark-ink-muted">Solo un admin de plataforma puede cambiar el acuerdo.</p>}

      <Panel title="Módulos" aside={`Plan: ${c.plan === 'growth' ? 'Growth' : c.plan === 'starter' ? 'Starter' : 'Prueba (todo Growth)'}`}>
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead><tr><th>Módulo</th><th>Según el plan</th><th>Para este cliente</th><th>Resultado</th></tr></thead>
            <tbody>
              {MODULES.map((m) => (
                <tr key={m.key}>
                  <td><div className="font-semibold">{m.label}</div><div className="text-xs text-ink-faint dark:text-dark-ink-faint">{m.hint}</div></td>
                  <td>{c.planLimits[m.flag] ? <Chip tone="good">Incluido</Chip> : <Chip tone="neutral">No incluido</Chip>}</td>
                  <td>
                    <select aria-label={`${m.label} para este cliente`} value={mods[m.key]} disabled={!isAdmin} onChange={(e) => setMods({ ...mods, [m.key]: e.target.value as ModuleChoice })}>
                      <option value="plan">Según el plan</option>
                      <option value="on">Habilitado</option>
                      <option value="off">Deshabilitado</option>
                    </select>
                  </td>
                  <td className="whitespace-nowrap">
                    {resulting(m) ? <Chip tone="good">Lo ve</Chip> : <Chip tone="bad">No lo ve</Chip>}
                    {mods[m.key] !== 'plan' && <span className="ml-1.5"><Chip tone="warn" dot={false}>excepción</Chip></span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Límites" aside="vacío = lo que da el plan">
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead><tr><th>Límite</th><th>Según el plan</th><th>Para este cliente</th></tr></thead>
            <tbody>
              {LIMITS.map((l) => {
                const planValue = l.key === 'freeTrialSeatCap' ? c.planLimits.freeTrialSeatCap : c.planLimits[l.key];
                const v = lims[l.key];
                return (
                  <tr key={l.key}>
                    <td>{l.label}</td>
                    <td className="tabular-nums">{limitLabel(planValue)}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          aria-label={`${l.label} para este cliente`}
                          className="w-28 tabular-nums"
                          disabled={!isAdmin || v === 'unlimited'}
                          value={v === 'unlimited' ? '' : v}
                          placeholder={limitLabel(planValue)}
                          onChange={(e) => setLims({ ...lims, [l.key]: e.target.value })}
                        />
                        {l.unlimitedOk && (
                          <label className="inline-flex items-center gap-1.5 text-sm">
                            <input type="checkbox" disabled={!isAdmin} checked={v === 'unlimited'} onChange={(e) => setLims({ ...lims, [l.key]: e.target.checked ? 'unlimited' : '' })} />
                            Sin límite
                          </label>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {isAdmin && (
        <Panel title="Guardar el acuerdo">
          <div className="grid gap-3 p-4">
            <label className="grid gap-1 text-sm font-medium" htmlFor="ag-reason">
              Acuerdo o motivo (obligatorio)
              <input id="ag-reason" value={reason} onChange={(e) => { setReason(e.target.value); setError(null); }} placeholder={`Ej.: piloto de Nómina por 3 meses acordado con ${c.owner?.name ?? 'el dueño'}`} />
            </label>
            <label className="grid max-w-xs gap-1 text-sm font-medium" htmlFor="ag-until">
              Vence (opcional)
              <input id="ag-until" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </label>
            <p className="m-0 rounded-lg border border-dashed border-line bg-surface-2 px-3 py-2 text-xs text-ink-muted dark:border-dark-line dark:bg-dark-raised dark:text-dark-ink-muted">
              Deshabilitar un módulo lo saca del menú del cliente y bloquea su API; los datos quedan guardados y vuelven si se habilita otra vez.
              Al vencer, el cliente vuelve solo a lo que da su plan. El acuerdo no cambia lo que se cobra.
            </p>
            {error && <p className="m-0 text-sm text-rose-600">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar acuerdo'}</button>
              {a && !confirmClear && <button type="button" className="btn-secondary" onClick={() => setConfirmClear(true)}>Quitar acuerdo</button>}
              {confirmClear && (
                <>
                  <span className="self-center text-sm">¿Vuelve a lo que da su plan?</span>
                  <button type="button" className="btn-secondary" disabled={busy} onClick={clear}>Sí, quitar</button>
                  <button type="button" className="btn-secondary" onClick={() => setConfirmClear(false)}>No</button>
                </>
              )}
            </div>
          </div>
        </Panel>
      )}
    </form>
  );
}
