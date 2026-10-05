import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PlusIcon } from '../common/Icons';
import { usePermissions } from '../../contexts/PermissionsContext';
import { projectsApi, type ProjectLimits, type ProjectSummary } from '../../api/projects';
import NewProjectModal from './NewProjectModal';
import ProjectFormModal from './ProjectFormModal';
import { ProgressBar, ProjectStatusChip } from './projectUi';

interface EntityProjectsSectionProps {
  token: string;
  // A Company's projects (with "+ Add" pre-filling that company), or the projects a person owns or
  // is on. Either way the list only holds what the viewer may see (the API applies the same rule
  // as /projects).
  companyId?: string;
  employeeId?: string;
}

// Projects module, unit 6 — the "Projects" block inside a Company's and a person's detail panel.
export default function EntityProjectsSection({ token, companyId, employeeId }: EntityProjectsSectionProps) {
  const { t } = useTranslation('projects');
  const navigate = useNavigate();
  const canCreate = usePermissions().has('manage_projects') && !!companyId;
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [limits, setLimits] = useState<ProjectLimits | null>(null);
  const [picking, setPicking] = useState(false);
  const [blank, setBlank] = useState(false);

  const load = useCallback(() => {
    projectsApi
      .listProjects(token, { companyId, employeeId })
      .then((r) => {
        setProjects(r.projects);
        setLimits(r.limits);
      })
      .catch(() => setProjects([]));
  }, [token, companyId, employeeId]);

  useEffect(load, [load]);

  const open = (projects ?? []).filter((p) => ['planning', 'active', 'on_hold'].includes(p.status));
  const closed = (projects ?? []).filter((p) => !['planning', 'active', 'on_hold'].includes(p.status));

  return (
    <div className="field-group">
      <div className="flex items-center justify-between">
        <h4 className="field-group-title">{t('section.title', { count: projects?.length ?? 0 })}</h4>
        {canCreate && (
          <button type="button" className="icon-btn" onClick={() => setPicking(true)} aria-label={t('list.add')}>
            <span className="tip">{t('list.add')}</span>
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="field-group-body !block">
        {projects === null ? (
          <p className="text-xs text-ink-faint dark:text-dark-ink-faint">{t('detail.loading')}</p>
        ) : projects.length === 0 ? (
          <p className="text-xs text-ink-faint dark:text-dark-ink-faint">{companyId ? t('section.emptyCompany') : t('section.emptyPerson')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {[...open, ...closed].map((p) => (
              <li key={p.id}>
                <Link
                  to={`/projects/${p.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2 dark:hover:bg-dark-raised"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink dark:text-dark-ink">{p.name}</span>
                    <span className="block truncate text-xs text-ink-faint dark:text-dark-ink-faint">
                      {employeeId ? (p.company?.name ?? t('list.internal')) : `${p.ownerEmployee.firstName} ${p.ownerEmployee.lastName}`}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <ProjectStatusChip status={p.status} />
                    <span className="w-full">
                      <ProgressBar done={p.progress.doneCount} total={p.progress.taskCount} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canCreate && (
        <>
          <NewProjectModal
            open={picking}
            token={token}
            limits={limits}
            defaultCompanyId={companyId}
            onClose={() => setPicking(false)}
            onBlank={() => {
              setPicking(false);
              setBlank(true);
            }}
            onCreated={(project) => {
              setPicking(false);
              navigate(`/projects/${project.id}`);
            }}
          />
          <ProjectFormModal
            open={blank}
            token={token}
            defaultCompanyId={companyId}
            onClose={() => setBlank(false)}
            onSaved={(project) => {
              setBlank(false);
              navigate(`/projects/${project.id}`);
            }}
          />
        </>
      )}
    </div>
  );
}
