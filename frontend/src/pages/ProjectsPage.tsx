import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import TableBody from '../components/common/TableBody';
import TableSkeleton from '../components/common/TableSkeleton';
import EntityCardList from '../components/common/EntityCardList';
import Avatar from '../components/common/Avatar';
import { FolderIcon, SearchIcon } from '../components/common/Icons';
import { useToast } from '../components/common/ToastProvider';
import { usePermissions } from '../contexts/PermissionsContext';
import { usePrimaryAction } from '../contexts/PrimaryActionContext';
import ProjectFormModal from '../components/projects/ProjectFormModal';
import { PROJECT_STATUS_COLOR, ProgressBar, ProjectStatusChip, isPastDue, useProjectDateFormat } from '../components/projects/projectUi';
import { projectsApi, type ProjectLimits, type ProjectStatus, type ProjectSummary } from '../api/projects';

// Projects module (2026-10-04, prototype approved by Alejandro) — every project the viewer can see
// (all of them with view_projects, otherwise the ones they own or are on), with progress computed
// from the tasks. Clicking a row opens the project's own page (/projects/:id).

type Filter = 'open' | ProjectStatus | 'all' | 'archived';
const FILTERS: Filter[] = ['open', 'active', 'planning', 'on_hold', 'completed', 'cancelled', 'all', 'archived'];
const OPEN: ProjectStatus[] = ['planning', 'active', 'on_hold'];
const COLS = 8;

export default function ProjectsPage({ token }: { token: string }) {
  const { t } = useTranslation('projects');
  const toast = useToast();
  const navigate = useNavigate();
  const permissions = usePermissions();
  const canCreate = permissions.has('manage_projects');
  const canSeeAll = permissions.has('view_projects');
  const fmt = useProjectDateFormat();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [limits, setLimits] = useState<ProjectLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('open');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const archived = filter === 'archived';
  const load = useCallback(() => {
    setLoading(true);
    projectsApi
      .listProjects(token, { archived })
      .then((r) => {
        setProjects(r.projects);
        setLimits(r.limits);
      })
      .catch((e) => toast.error(t('list.loadError', { message: (e as Error).message })))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, archived]);

  useEffect(load, [load]);

  const atLimit = !!limits && limits.maxActiveProjects !== null && limits.openCount >= limits.maxActiveProjects;
  const openNew = () => {
    if (atLimit) {
      toast.error(t('list.atLimit', { max: limits!.maxActiveProjects }));
      return;
    }
    setCreating(true);
  };
  usePrimaryAction(canCreate ? { label: t('list.primaryAction'), onClick: openNew } : null);

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return projects.filter((p) => {
      if (filter === 'archived') {
        if (p.isActive) return false;
      } else if (filter === 'open') {
        if (!OPEN.includes(p.status)) return false;
      } else if (filter !== 'all' && p.status !== filter) {
        return false;
      }
      if (!q) return true;
      return [p.name, p.company?.name, `${p.ownerEmployee.firstName} ${p.ownerEmployee.lastName}`].some((v) => v?.toLocaleLowerCase().includes(q));
    });
  }, [projects, filter, search]);

  const empty =
    projects.length === 0 && filter === 'open'
      ? canSeeAll
        ? { icon: <FolderIcon />, title: t('list.emptyTitle'), body: t('list.emptyBody') }
        : { icon: <FolderIcon />, title: t('list.emptyMemberTitle'), body: t('list.emptyMemberBody') }
      : {
          icon: <FolderIcon />,
          title: t('list.emptyFilteredTitle'),
          actions: (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                setFilter('open');
                setSearch('');
              }}
            >
              {t('list.clearFilters')}
            </button>
          ),
        };

  return (
    <div className="page-full flex flex-col gap-4">
      <div>
        <h2 className="page-title">{t('list.title')}</h2>
        <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('list.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="toolbar-search">
          <SearchIcon />
          <label htmlFor="project-search" className="sr-only">
            {t('list.searchLabel')}
          </label>
          <input id="project-search" type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('list.searchPlaceholder')} />
        </div>
        <div className="task-view-toggle flex-wrap" role="group" aria-label={t('list.columns.status')}>
          {FILTERS.map((f) => (
            <button key={f} type="button" className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {t(`list.filters.${f}`)}
            </button>
          ))}
        </div>
        {limits && limits.maxActiveProjects !== null && (
          <span className={`ml-auto text-xs ${atLimit ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-ink-faint dark:text-dark-ink-faint'}`}>
            {t('list.planUsage', { count: limits.openCount, max: limits.maxActiveProjects })}
          </span>
        )}
      </div>

      {loading ? (
        <TableSkeleton columns={COLS} />
      ) : (
        <>
        {/* Phones get cards (same split as Companies/People); the table below is hidden there. */}
        <EntityCardList
          items={visible}
          getKey={(p) => p.id}
          getInitials={(p) => p.name.slice(0, 2).toUpperCase()}
          getName={(p) => p.name}
          getMeta={(p) =>
            `${p.company?.name ?? t('list.internal')} · ${p.progress.doneCount}/${p.progress.taskCount} · ${t(`status.${p.status}`)}`
          }
          getStatusColor={(p) => PROJECT_STATUS_COLOR[p.status]}
          onSelect={(p) => navigate(`/projects/${p.id}`)}
        />
        <div className={`full-table-wrap${visible.length === 0 ? '' : ' has-mobile-cards'}`}>
          <table className="table full-table !mt-0">
            <colgroup>
              <col style={{ width: '24%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>{t('list.columns.project')}</th>
                <th>{t('list.columns.company')}</th>
                <th>{t('list.columns.owner')}</th>
                <th>{t('list.columns.phase')}</th>
                <th>{t('list.columns.progress')}</th>
                <th>{t('list.columns.nextDue')}</th>
                <th>{t('list.columns.due')}</th>
                <th>{t('list.columns.status')}</th>
              </tr>
            </thead>
            <TableBody colSpan={COLS} isEmpty={visible.length === 0} empty={empty} onAdd={canCreate && !archived ? openNew : undefined} addLabel={t('list.add')}>
              {visible.map((p) => {
                const phase = p.phases.find((ph) => ph.id === p.progress.currentPhaseId);
                const nextDue = p.progress.nextDueDate;
                return (
                  <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/projects/${p.id}`)}>
                    <td>
                      <div className="truncate font-medium" title={p.name}>
                        {p.name}
                      </div>
                      <div className="text-xs text-ink-faint dark:text-dark-ink-faint">
                        {p.template ? t('list.fromTemplate', { name: p.template.name }) : t('list.blank')}
                      </div>
                    </td>
                    <td>{p.company ? p.company.name : <span className="text-ink-faint dark:text-dark-ink-faint">{t('list.internal')}</span>}</td>
                    <td>
                      <span className="inline-flex items-center gap-2 whitespace-nowrap">
                        <Avatar firstName={p.ownerEmployee.firstName} lastName={p.ownerEmployee.lastName} />
                        {p.ownerEmployee.firstName} {p.ownerEmployee.lastName}
                      </span>
                    </td>
                    <td>
                      {phase ? (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ink-muted dark:text-dark-ink-muted">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: phase.color ?? '#8f8aa8' }} />
                          {phase.name}
                        </span>
                      ) : (
                        <span className="text-ink-faint dark:text-dark-ink-faint">—</span>
                      )}
                    </td>
                    <td>
                      <ProgressBar done={p.progress.doneCount} total={p.progress.taskCount} label={`${p.progress.doneCount}/${p.progress.taskCount}`} />
                    </td>
                    <td className={`whitespace-nowrap tabular-nums ${isPastDue(nextDue) ? 'font-semibold text-red-600 dark:text-red-400' : ''}`}>{fmt(nextDue)}</td>
                    <td className="whitespace-nowrap tabular-nums">{fmt(p.dueDate)}</td>
                    <td>
                      <ProjectStatusChip status={p.status} />
                    </td>
                  </tr>
                );
              })}
            </TableBody>
          </table>
        </div>
        </>
      )}

      <ProjectFormModal
        open={creating}
        token={token}
        onClose={() => setCreating(false)}
        onSaved={(project) => {
          setCreating(false);
          navigate(`/projects/${project.id}`);
        }}
      />
    </div>
  );
}
