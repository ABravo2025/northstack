import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type CompanyHealth } from '../../../api';
import { useToast } from '../../common/ToastProvider';

// Clientes C6: the client's health score with its breakdown, and the check-ins log.
const STATUS_CHIP = { healthy: 'to-chip-approved', at_risk: 'to-chip-pending', critical: 'to-chip-rejected' } as const;

export default function CompanyHealthTab({ token, companyId, canManage }: { token: string; companyId: string; canManage: boolean }) {
  const { t, i18n } = useTranslation('crm');
  const toast = useToast();
  const [health, setHealth] = useState<CompanyHealth | null>(null);
  const [form, setForm] = useState<{ sentiment: 'good' | 'neutral' | 'bad'; note: string }>({ sentiment: 'good', note: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api
      .getCompanyHealth(token, companyId)
      .then(setHealth)
      .catch((e) => toast.error((e as Error).message));
  }, [token, companyId, toast]);
  useEffect(load, [load]);

  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

  const save = async () => {
    setSaving(true);
    try {
      await api.addCompanyCheckIn(token, companyId, { sentiment: form.sentiment, note: form.note.trim() || null });
      setForm({ sentiment: 'good', note: '' });
      toast.success(t('company360.health.checkInSaved'));
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!health) return <div className="overview-panel-left text-sm text-ink-muted dark:text-dark-ink-muted">{t('company360.loading')}</div>;
  const overdue = health.nextCheckInAt && new Date(health.nextCheckInAt).getTime() < Date.now();

  return (
    <div className="overview-panel-left">
      <div className="field-group">
        <h4 className="field-group-title">{t('company360.tabs.health')}</h4>
        <div className="flex items-center gap-3">
          <span className="num text-3xl font-semibold">{health.score}</span>
          <span className={`to-chip ${STATUS_CHIP[health.status]}`}>{t(`company360.health.status.${health.status}`)}</span>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {health.parts.map((p) => (
            <div key={p.part} className="ex-cat-row">
              <span className="truncate" title={t(`company360.health.hint.${p.part}`)}>
                {t(`company360.health.part.${p.part}`)} <span className="ex-muted text-xs">({p.weight}%)</span>
              </span>
              <div className="ex-bar">
                <div className="ex-bar-fill" style={{ width: `${Math.max(2, p.score)}%`, opacity: p.hasData ? 1 : 0.35 }} />
              </div>
              <span className="num text-right text-sm">{p.hasData ? p.score : t('company360.health.noData')}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 mb-0 text-xs text-ink-muted dark:text-dark-ink-muted">{t('company360.health.explain')}</p>
      </div>

      <div className="field-group border-b-0">
        <h4 className="field-group-title">{t('company360.health.checkIns')}</h4>
        <p className="m-0 text-sm">
          {t('company360.health.lastContact', { date: date(health.lastContactAt) })} ·{' '}
          <span className={overdue ? 'font-semibold text-red-700 dark:text-red-300' : ''}>{t('company360.health.nextCheckIn', { date: date(health.nextCheckInAt) })}</span>
        </p>
        {canManage && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-line p-3 dark:border-dark-line">
            <div className="mini-toggle-row">
              {(['good', 'neutral', 'bad'] as const).map((s) => (
                <button key={s} type="button" className={`mini-toggle-opt ${form.sentiment === s ? 'active' : ''}`} onClick={() => setForm({ ...form, sentiment: s })}>
                  {t(`company360.health.sentiment.${s}`)}
                </button>
              ))}
            </div>
            <textarea rows={2} maxLength={2000} value={form.note} placeholder={t('company360.health.notePlaceholder')} aria-label={t('company360.health.notePlaceholder')} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <button type="button" className="btn-primary btn-sm self-start" disabled={saving} onClick={save}>
              {t('company360.health.logCheckIn')}
            </button>
          </div>
        )}
        {health.checkIns.length === 0 ? (
          <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('company360.health.noCheckIns')}</p>
        ) : (
          <ul className="ex-due mt-2">
            {health.checkIns.map((c) => (
              <li key={c.id}>
                <span className="flex min-w-0 flex-col">
                  <strong className="text-sm font-medium">
                    {t(`company360.health.sentiment.${c.sentiment}`)} · {date(c.at)}
                    {c.byName ? ` · ${c.byName}` : ''}
                  </strong>
                  {c.note && <span className="ex-muted text-xs whitespace-pre-line">{c.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
