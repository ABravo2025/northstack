import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, type CompanyOnboardingProject } from '../../../api';

// Clientes C5: the company's projects, the onboarding one from the hand-off first, with progress.
export default function CompanyOnboardingTab({ token, companyId }: { token: string; companyId: string }) {
  const { t, i18n } = useTranslation('crm');
  const navigate = useNavigate();
  const [projects, setProjects] = useState<CompanyOnboardingProject[] | null>(null);

  useEffect(() => {
    api
      .getCompanyOnboarding(token, companyId)
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [token, companyId]);

  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : null);

  return (
    <div className="overview-panel-left">
      <div className="field-group border-b-0">
        <h4 className="field-group-title">{t('company360.tabs.onboarding')}</h4>
        {projects === null ? (
          <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('company360.loading')}</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('company360.onboarding.empty')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {projects.map((p) => {
              const pct = p.tasks ? Math.round((p.tasksDone / p.tasks) * 100) : p.status === 'completed' ? 100 : 0;
              return (
                <li key={p.id} className="flex flex-col gap-1.5 rounded-lg border border-line p-3 dark:border-dark-line">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button type="button" className="to-link text-left font-semibold" onClick={() => navigate(`/projects/${p.id}`)}>
                      {p.name}
                    </button>
                    <span className="flex items-center gap-2">
                      {p.isOnboarding && <span className="to-chip ex-chip-auto">{t('company360.onboarding.badge')}</span>}
                      <span className={`to-chip ${p.status === 'completed' ? 'to-chip-approved' : 'to-chip-cancelled'}`}>{t(`company360.onboarding.status.${p.status}`, { defaultValue: p.status })}</span>
                    </span>
                  </div>
                  <div className="ex-bar">
                    <div className="ex-bar-fill" style={{ width: `${Math.max(2, pct)}%` }} />
                  </div>
                  <span className="text-xs text-ink-muted dark:text-dark-ink-muted">
                    {t('company360.onboarding.progress', { done: p.tasksDone, total: p.tasks, pct })}
                    {p.ownerEmployee ? ` · ${p.ownerEmployee.firstName} ${p.ownerEmployee.lastName}` : ''}
                    {date(p.dueDate) ? ` · ${t('company360.onboarding.due', { date: date(p.dueDate) })}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
