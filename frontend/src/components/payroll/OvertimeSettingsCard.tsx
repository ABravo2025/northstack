import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { OvertimePolicy, OvertimeSetup, OvertimeTemplate } from '../../api';
import { useToast } from '../common/ToastProvider';

// Payroll → Payment policies → Overtime (spec-overtime.md, Growth): each company sets its own rules —
// when an hour is overtime, the surcharges, and who doesn't get overtime. "Start from Argentina / US /
// custom" fills the form; everything can be edited. Applied when approved hours are brought into a
// pay run.

const toHours = (m: number | null) => (m === null ? '' : String(Math.round((m / 60) * 100) / 100));
const fromHours = (v: string) => (v.trim() === '' ? null : Math.round(Number(v) * 60));
const toTime = (m: number | null) => (m === null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
const fromTime = (v: string) => {
  if (!v) return null;
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
};
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

export default function OvertimeSettingsCard({ token }: { token: string }) {
  const { t, i18n } = useTranslation('hr');
  const toast = useToast();
  const [setup, setSetup] = useState<OvertimeSetup | null>(null);
  const [form, setForm] = useState<OvertimePolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getOvertimeSetup(token)
      .then((s) => {
        setSetup(s);
        setForm(s.policy);
      })
      .catch(() => setSetup(null));
  }, [token]);

  if (!setup || !form) return null;
  const set = (patch: Partial<OvertimePolicy>) => setForm({ ...form, ...patch });
  const dayName = (d: number) => new Date(Date.UTC(2026, 9, 18 + d)).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { weekday: 'short', timeZone: 'UTC' });

  const startFrom = (template: OvertimeTemplate) => setForm({ ...form, ...setup.templates[template], template });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await api.saveOvertimePolicy(token, form);
      setForm(saved);
      toast.success(t('payroll.overtime.saved'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleExempt = async (id: string, exempt: boolean) => {
    setSetup({ ...setup, people: setup.people.map((p) => (p.id === id ? { ...p, exempt } : p)) });
    try {
      await api.setOvertimeExempt(token, id, exempt);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const num = (id: string, label: string, value: string, onChange: (v: string) => void, suffix: string) => (
    <div className="form-group !mb-0">
      <label htmlFor={id}>{label}</label>
      <div className="flex items-center gap-1.5">
        <input id={id} type="number" min={0} step="0.5" className="!w-24" value={value} onChange={(e) => onChange(e.target.value)} disabled={!form.enabled} />
        <span className="text-sm text-ink-muted dark:text-dark-ink-muted">{suffix}</span>
      </div>
    </div>
  );

  return (
    <div className="card mt-6" id="overtime">
      <h3 className="card-title mb-1">{t('payroll.overtime.title')}</h3>
      <p className="mb-3 text-sm text-ink-muted dark:text-dark-ink-muted">{t('payroll.overtime.lead')}</p>

      <label className="rules-switch switch-row mb-3">
        <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        {t('payroll.overtime.enabled')}
      </label>

      {form.enabled && (
        <div className="flex flex-col gap-4">
          <div className="form-group !mb-0">
            <span className="rules-label">{t('payroll.overtime.startFrom')}</span>
            <div className="mini-toggle-row mt-1" role="group" aria-label={t('payroll.overtime.startFrom')}>
              {(['ar', 'us', 'custom'] as OvertimeTemplate[]).map((tpl) => (
                <button key={tpl} type="button" className={`mini-toggle-opt ${form.template === tpl ? 'active' : ''}`} onClick={() => startFrom(tpl)}>
                  {t(`payroll.overtime.templates.${tpl}`)}
                </button>
              ))}
            </div>
            <p className="m-0 mt-1 text-xs text-ink-faint dark:text-dark-ink-faint">{t(`payroll.overtime.templateHint.${form.template}`)}</p>
          </div>

          <div>
            <span className="rules-label">{t('payroll.overtime.whenTitle')}</span>
            <div className="mt-1 flex flex-wrap gap-4">
              {num('ot-daily', t('payroll.overtime.daily'), toHours(form.dailyThresholdMinutes), (v) => set({ dailyThresholdMinutes: fromHours(v), template: 'custom' }), t('payroll.overtime.hoursPerDay'))}
              {num('ot-weekly', t('payroll.overtime.weekly'), toHours(form.weeklyThresholdMinutes), (v) => set({ weeklyThresholdMinutes: fromHours(v), template: 'custom' }), t('payroll.overtime.hoursPerWeek'))}
            </div>
            <p className="m-0 mt-1 text-xs text-ink-faint dark:text-dark-ink-faint">{t('payroll.overtime.whenHint')}</p>
          </div>

          <div>
            <span className="rules-label">{t('payroll.overtime.surchargesTitle')}</span>
            <div className="mt-1 flex flex-wrap gap-4">
              {num('ot-weekday', t('payroll.overtime.weekdayPct'), String(form.weekdayPct), (v) => set({ weekdayPct: Math.round(Number(v) || 0), template: 'custom' }), '%')}
              {num('ot-rest', t('payroll.overtime.restPct'), String(form.restPct), (v) => set({ restPct: Math.round(Number(v) || 0), template: 'custom' }), '%')}
            </div>
          </div>

          <div>
            <span className="rules-label">{t('payroll.overtime.restTitle')}</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => (
                <label key={d} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={form.restWeekdays.includes(d)}
                    onChange={(e) => set({ restWeekdays: e.target.checked ? [...form.restWeekdays, d] : form.restWeekdays.filter((x) => x !== d), template: 'custom' })}
                  />
                  <span className="capitalize">{dayName(d)}</span>
                </label>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={form.holidaysAreRest} onChange={(e) => set({ holidaysAreRest: e.target.checked, template: 'custom' })} />
                {t('payroll.overtime.holidays')}
              </label>
              <div className="flex items-center gap-1.5 text-sm">
                <label htmlFor="ot-saturday">{t('payroll.overtime.saturdayFrom')}</label>
                <input id="ot-saturday" type="time" className="!w-28" value={toTime(form.saturdayFromMinute)} onChange={(e) => set({ saturdayFromMinute: fromTime(e.target.value), template: 'custom' })} />
              </div>
            </div>
          </div>

          <div>
            <span className="rules-label">{t('payroll.overtime.nightTitle')}</span>
            <div className="mt-1 flex flex-wrap items-end gap-4">
              <div className="form-group !mb-0">
                <label htmlFor="ot-night-from">{t('payroll.overtime.nightFrom')}</label>
                <input id="ot-night-from" type="time" className="!w-28" value={toTime(form.nightStartMinute)} onChange={(e) => set({ nightStartMinute: fromTime(e.target.value), template: 'custom' })} />
              </div>
              <div className="form-group !mb-0">
                <label htmlFor="ot-night-to">{t('payroll.overtime.nightTo')}</label>
                <input id="ot-night-to" type="time" className="!w-28" value={toTime(form.nightEndMinute)} onChange={(e) => set({ nightEndMinute: fromTime(e.target.value), template: 'custom' })} />
              </div>
              {num('ot-night-pct', t('payroll.overtime.nightPct'), String(form.nightPct), (v) => set({ nightPct: Math.round(Number(v) || 0), template: 'custom' }), '%')}
            </div>
            <p className="m-0 mt-1 text-xs text-ink-faint dark:text-dark-ink-faint">{t('payroll.overtime.timeHint')}</p>
          </div>

          {setup.people.length > 0 && (
            <div>
              <span className="rules-label">{t('payroll.overtime.exemptTitle')}</span>
              <p className="m-0 text-xs text-ink-faint dark:text-dark-ink-faint">{t('payroll.overtime.exemptHint')}</p>
              <div className="mt-1 flex flex-col">
                {setup.people.map((p) => (
                  <label key={p.id} className="rules-switch switch-row">
                    <input type="checkbox" checked={p.exempt} onChange={(e) => toggleExempt(p.id, e.target.checked)} />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="m-0 mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      <div className="mt-4">
        <button type="button" className="btn-primary" disabled={busy} onClick={save}>
          {busy ? t('payroll.overtime.saving') : t('payroll.overtime.save')}
        </button>
      </div>
    </div>
  );
}
