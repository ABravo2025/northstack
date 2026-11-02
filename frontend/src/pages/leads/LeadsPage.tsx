import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { api, type Lead } from '../../api';
import TableBody from '../../components/common/TableBody';
import TableSkeleton from '../../components/common/TableSkeleton';
import { useToast } from '../../components/common/ToastProvider';
import { usePermissions } from '../../contexts/PermissionsContext';
import LeadModal from './LeadModal';

// Clientes C2 (spec-clientes-gastos-formularios.md): the Leads inbox, separate from the pipelines.
// Open leads sort by who's due first; each one is worked with a 5-touch cadence and qualified with
// 4 questions, then converted into company + contact + opportunity.
type View = 'open' | 'converted' | 'disqualified';

export default function LeadsPage({ token, userId }: { token: string; userId: string }) {
  const { t, i18n } = useTranslation('crm');
  const toast = useToast();
  const permissions = usePermissions();
  const canManage = permissions.has('manage_contact');
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>('open');
  const [owner, setOwner] = useState<'' | 'mine' | 'none'>('');
  const [q, setQ] = useState('');
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const openId = params.get('open');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api
      .listLeads(token, { view, ownerId: owner === 'mine' ? userId : owner === 'none' ? 'none' : undefined, q: q || undefined })
      .then(setLeads)
      .catch((e) => toast.error((e as Error).message));
  }, [token, view, owner, q, userId, toast]);
  useEffect(() => {
    const h = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(h);
  }, [load, q]);

  const now = Date.now();
  const dateFmt = (iso: string) => new Date(iso).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { day: 'numeric', month: 'short' });
  const qualified = (l: Lead) => Object.values(l.qualification).filter((v) => v === true).length;
  const close = () => {
    params.delete('open');
    setParams(params, { replace: true });
  };

  return (
    <div className="container sh-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="to-title">{t('leadsInbox.title')}</h2>
          <p className="to-subtitle max-w-3xl">{t('leadsInbox.subtitle')}</p>
        </div>
        {canManage && (
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            {t('leadsInbox.new')}
          </button>
        )}
      </div>

      <div className="ex-filters">
        <div className="mini-toggle-row" role="group">
          {(['open', 'converted', 'disqualified'] as const).map((v) => (
            <button key={v} type="button" className={`mini-toggle-opt ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
              {t(`leadsInbox.views.${v}`)}
            </button>
          ))}
        </div>
        <select className="max-w-48" value={owner} onChange={(e) => setOwner(e.target.value as '' | 'mine' | 'none')} aria-label={t('leadsInbox.columns.owner')}>
          <option value="">{t('leadsInbox.owner.all')}</option>
          <option value="mine">{t('leadsInbox.owner.mine')}</option>
          <option value="none">{t('leadsInbox.owner.none')}</option>
        </select>
        <input className="max-w-72 flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('leadsInbox.search')} aria-label={t('leadsInbox.search')} />
      </div>

      {leads === null ? (
        <TableSkeleton rows={6} />
      ) : (
        <div className="full-table-wrap">
          <table className="table full-table to-table">
            <thead>
              <tr>
                <th>{t('leadsInbox.columns.lead')}</th>
                <th>{t('leadsInbox.columns.company')}</th>
                <th>{t('leadsInbox.columns.source')}</th>
                <th className="text-right">{t('leadsInbox.columns.score')}</th>
                <th className="text-center">{t('leadsInbox.columns.qualification')}</th>
                <th className="text-center">{t('leadsInbox.columns.touches')}</th>
                <th>{view === 'open' ? t('leadsInbox.columns.nextTouch') : t('leadsInbox.columns.status')}</th>
                <th>{t('leadsInbox.columns.owner')}</th>
              </tr>
            </thead>
            <TableBody
              colSpan={8}
              isEmpty={leads.length === 0}
              empty={{ title: t(`leadsInbox.empty.${view}`) }}
              onAdd={canManage && view === 'open' ? () => setCreating(true) : undefined}
              addLabel={t('leadsInbox.new')}
            >
              {leads.map((l) => {
                const overdue = l.nextTouchAt && new Date(l.nextTouchAt).getTime() < now;
                return (
                  <tr
                    key={l.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => setParams({ open: l.id })}
                    onKeyDown={(e) => e.key === 'Enter' && setParams({ open: l.id })}
                  >
                    <td className="!whitespace-normal">
                      <span className="flex flex-col">
                        <strong>{`${l.firstName} ${l.lastName}`.trim()}</strong>
                        <span className="ex-muted text-xs">{l.email}</span>
                      </span>
                    </td>
                    <td>{l.companyName ?? '—'}</td>
                    <td className="text-sm">{l.leadSource?.name ?? (l.utmSource || (l.formId ? t('leadsInbox.sourceForm') : '—'))}</td>
                    <td className="text-right">
                      <span className="inline-flex items-center gap-2">
                        <span className="ex-bar inline-block w-14">
                          <span className="ex-bar-fill block" style={{ width: `${Math.max(4, l.score)}%` }} />
                        </span>
                        <span className="num text-sm">{l.score}</span>
                      </span>
                    </td>
                    <td className="num text-center">{qualified(l)}/4</td>
                    <td className="num text-center">{Math.min(l.touchCount, 5)}/5</td>
                    <td className="text-sm">
                      {view === 'open' ? (
                        l.nextTouchAt ? (
                          <span className={overdue ? 'font-semibold text-red-700 dark:text-red-300' : ''}>
                            {overdue ? t('leadsInbox.overdue', { date: dateFmt(l.nextTouchAt) }) : dateFmt(l.nextTouchAt)}
                          </span>
                        ) : (
                          <span className="ex-muted">{t('leadsInbox.cadenceDone')}</span>
                        )
                      ) : (
                        <span className={`to-chip ${l.status === 'converted' ? 'to-chip-approved' : 'to-chip-cancelled'}`}>{t(`leadsInbox.status.${l.status}`)}</span>
                      )}
                    </td>
                    <td className="text-sm">{l.owner ? `${l.owner.firstName} ${l.owner.lastName}` : <span className="ex-muted">{t('leadsInbox.owner.none')}</span>}</td>
                  </tr>
                );
              })}
            </TableBody>
          </table>
        </div>
      )}

      <section className="card ex-info">
        <div>
          <strong>{t('leadsInbox.infoCadenceTitle')}</strong>
          <span>{t('leadsInbox.infoCadenceBody')}</span>
        </div>
        <div>
          <strong>{t('leadsInbox.infoQualifyTitle')}</strong>
          <span>{t('leadsInbox.infoQualifyBody')}</span>
        </div>
        <div>
          <strong>{t('leadsInbox.infoConvertTitle')}</strong>
          <span>{t('leadsInbox.infoConvertBody')}</span>
        </div>
      </section>

      {(openId || creating) && (
        <LeadModal
          token={token}
          leadId={creating ? null : openId}
          canManage={canManage}
          onClose={() => {
            setCreating(false);
            close();
          }}
          onChanged={load}
          onCreated={(id) => {
            setCreating(false);
            setParams({ open: id });
            load();
          }}
        />
      )}
    </div>
  );
}
