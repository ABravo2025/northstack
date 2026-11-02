import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, type ClientSignal } from '../api';
import TableBody from '../components/common/TableBody';
import TableSkeleton from '../components/common/TableSkeleton';
import { useToast } from '../components/common/ToastProvider';
import { usePermissions } from '../contexts/PermissionsContext';
import { formatMoney } from '../lib/currencies';

// Clientes C8 (spec-clientes-gastos-formularios.md): expansion, renewal and risk signals across
// clients, computed from health, products, surveys and renewal dates. One click opens the deal in
// the Expansion or Renewals pipeline.
const KIND_CHIP = { risk: 'to-chip-rejected', renewal: 'to-chip-pending', expansion: 'to-chip-approved' } as const;

export default function SignalsPage({ token }: { token: string }) {
  const { t, i18n } = useTranslation('crm');
  const toast = useToast();
  const navigate = useNavigate();
  const permissions = usePermissions();
  const canCreate = permissions.has('manage_opportunity');
  const [signals, setSignals] = useState<ClientSignal[] | null>(null);
  const [kind, setKind] = useState<'' | ClientSignal['kind']>('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .listClientSignals(token)
      .then(setSignals)
      .catch((e) => toast.error((e as Error).message));
  }, [token, toast]);
  useEffect(load, [load]);

  const create = async (s: ClientSignal) => {
    setBusy(`${s.companyId}:${s.kind}`);
    try {
      await api.createSignalOpportunity(token, { companyId: s.companyId, kind: s.kind === 'expansion' ? 'expansion' : 'renewal', productIds: s.products.map((p) => p.id) });
      toast.success(t('signals.created'));
      load();
    } catch (e) {
      const code = e instanceof ApiError ? (e.body as { code?: string } | undefined)?.code : undefined;
      toast.error(code === 'no_pipeline' ? t(`signals.noPipeline.${s.kind === 'expansion' ? 'expansion' : 'renewal'}`) : (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const visible = (signals ?? []).filter((s) => !kind || s.kind === kind);
  const date = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  return (
    <div className="container sh-page">
      <div>
        <h2 className="to-title">{t('signals.title')}</h2>
        <p className="to-subtitle max-w-3xl">{t('signals.subtitle')}</p>
      </div>
      <div className="mini-toggle-row">
        {(['', 'risk', 'renewal', 'expansion'] as const).map((k) => (
          <button key={k || 'all'} type="button" className={`mini-toggle-opt ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>
            {t(`signals.filter.${k || 'all'}`)} {signals ? `(${(signals ?? []).filter((s) => !k || s.kind === k).length})` : ''}
          </button>
        ))}
      </div>
      {signals === null ? (
        <TableSkeleton rows={5} />
      ) : (
        <div className="full-table-wrap">
          <table className="table full-table to-table">
            <thead>
              <tr>
                <th>{t('signals.columns.kind')}</th>
                <th>{t('signals.columns.company')}</th>
                <th>{t('signals.columns.why')}</th>
                <th className="text-right">{t('signals.columns.health')}</th>
                <th className="text-right">{t('signals.columns.mrr')}</th>
                <th>{t('signals.columns.what')}</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <TableBody colSpan={7} isEmpty={visible.length === 0} empty={{ title: t('signals.empty') }}>
              {visible.map((s) => (
                <tr key={`${s.companyId}:${s.kind}`}>
                  <td>
                    <span className={`to-chip ${KIND_CHIP[s.kind]}`}>{t(`signals.kind.${s.kind}`)}</span>
                  </td>
                  <td>
                    <strong>{s.companyName}</strong>
                  </td>
                  <td className="!whitespace-normal text-sm">{s.reasons.map((r) => t(`signals.reason.${r}`)).join(' · ')}</td>
                  <td className="num text-right">{s.healthScore}</td>
                  <td className="num text-right whitespace-nowrap">{s.mrr.length ? s.mrr.map((m) => formatMoney(m.cents, m.currency)).join(' + ') : '—'}</td>
                  <td className="!whitespace-normal text-sm">
                    {s.renewalDate && <span className="block">{t('signals.renews', { date: date(s.renewalDate) })}</span>}
                    {s.products.length > 0 && <span className="ex-muted">{s.products.map((p) => p.name).join(', ')}</span>}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {canCreate && s.kind !== 'risk' ? (
                      <button type="button" className="btn-secondary btn-sm" disabled={busy === `${s.companyId}:${s.kind}`} onClick={() => create(s)}>
                        {t('signals.createDeal')}
                      </button>
                    ) : canCreate && s.renewalDate ? (
                      <button type="button" className="btn-secondary btn-sm" disabled={busy === `${s.companyId}:${s.kind}`} onClick={() => create(s)}>
                        {t('signals.createRenewal')}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </TableBody>
          </table>
        </div>
      )}
      <p className="ex-hint">
        {t('signals.howItWorks')}{' '}
        <button type="button" className="to-link" onClick={() => navigate('/settings/pipelines')}>
          {t('signals.pipelinesLink')}
        </button>
      </p>
    </div>
  );
}
