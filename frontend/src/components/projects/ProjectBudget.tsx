import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { projectsApi, type ProjectDetail } from '../../api/projects';
import { useToast } from '../common/ToastProvider';
import { usePermissions } from '../../contexts/PermissionsContext';
import { formatDuration } from '../../lib/shiftDates';

interface ProjectBudgetProps {
  token: string;
  project: ProjectDetail;
  canEdit: boolean;
  onChange: (project: ProjectDetail) => void;
}

// Hours logged to the project (timesheets) against its hour budget (spec-shifts-fase2.md §C,
// Growth): green, amber from 80 %, red when over. Editable by whoever edits the project.
export default function ProjectBudget({ token, project, canEdit, onChange }: ProjectBudgetProps) {
  const { t } = useTranslation('projects');
  const toast = useToast();
  const { features } = usePermissions();
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState('');

  if (!features.billableHours) return null;
  const budget = project.budgetMinutes ?? null;
  const used = project.loggedMinutes ?? 0;
  const pct = budget ? Math.round((used / budget) * 100) : 0;
  const tone = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';

  const save = async (value: number | null) => {
    try {
      onChange(await projectsApi.updateProject(token, project.id, { budgetMinutes: value }));
      setEditing(false);
    } catch (e) {
      toast.error(t('budget.failed', { message: (e as Error).message }));
    }
  };

  if (editing) {
    return (
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const h = Number(hours);
          void save(hours.trim() === '' ? null : Math.round(h * 60));
        }}
      >
        <div className="form-group !mb-0">
          <label htmlFor="project-budget">{t('budget.hours')}</label>
          <input id="project-budget" type="number" min={1} step="0.5" className="!w-28" value={hours} onChange={(e) => setHours(e.target.value)} autoFocus />
        </div>
        <button type="submit" className="btn-primary !py-1.5">
          {t('budget.save')}
        </button>
        <button type="button" className="btn-secondary !py-1.5" onClick={() => setEditing(false)}>
          {t('budget.cancel')}
        </button>
      </form>
    );
  }

  const edit = canEdit && (
    <button
      type="button"
      className="to-link text-xs"
      onClick={() => {
        setHours(budget ? String(Math.round((budget / 60) * 10) / 10) : '');
        setEditing(true);
      }}
    >
      {budget ? t('budget.edit') : t('budget.set')}
    </button>
  );

  if (!budget) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted dark:text-dark-ink-muted">
        <span>{t('budget.logged', { hours: formatDuration(used) })}</span>
        {edit}
      </div>
    );
  }
  return (
    <div className="flex max-w-xl items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2 dark:bg-dark-raised" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`whitespace-nowrap text-sm ${pct >= 100 ? 'text-red-700 dark:text-red-300' : 'text-ink-muted dark:text-dark-ink-muted'}`}>
        {t('budget.of', { used: formatDuration(used), budget: formatDuration(budget), pct })}
      </span>
      {edit}
    </div>
  );
}
