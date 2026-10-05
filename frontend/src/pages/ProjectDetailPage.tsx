import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type Task } from '../api';
import {
  PROJECT_STATUSES,
  projectsApi,
  type ProjectDetail,
  type ProjectMember,
  type ProjectOptionEmployee,
  type ProjectPhase,
  type ProjectStatus,
} from '../api/projects';
import Avatar from '../components/common/Avatar';
import ConfirmDialog from '../components/common/ConfirmDialog';
import Modal from '../components/common/Modal';
import TableBody from '../components/common/TableBody';
import { ChevronDownIcon, ChevronLeftIcon, FolderIcon, PencilIcon, PeopleIcon, PlusIcon, TaskCheckIcon, TrashIcon } from '../components/common/Icons';
import { useToast } from '../components/common/ToastProvider';
import KanbanBoard from '../components/entity-views/KanbanBoard';
import EntityNotesList from '../components/notes/EntityNotesList';
import EntityActivityList from '../components/activity/EntityActivityList';
import TaskDetailModal from '../components/tasks/TaskDetailModal';
import ProjectFormModal from '../components/projects/ProjectFormModal';
import { ProgressBar, ProjectStatusChip, isPastDue, useProjectDateFormat } from '../components/projects/projectUi';
import { useTaskFolders } from '../hooks/useTaskFolders';
import { useGoogleCalendarConnected } from '../hooks/useGoogleCalendarConnected';

// Projects module (2026-10-04, prototype approved by Alejandro) — one project's workspace: its
// phases with their tasks (list or board), its team, and Notes/Activity on the side. Tasks are
// ordinary Task rows (entityType 'project'), so completing one here is the same as completing it
// from My Tasks or Google Calendar. Editing details/phases/team needs canEdit (manage_projects or
// being the owner); anyone who can see the project can add and complete tasks.

type Tab = 'tasks' | 'board' | 'team';
type SideTab = 'notes' | 'activity';
const NO_PHASE = '__none__';

interface TenantUserLite {
  id: string;
  firstName: string;
  lastName: string;
}

export default function ProjectDetailPage({ token, user }: { token: string; user: { id: string } }) {
  const { t } = useTranslation('projects');
  const toast = useToast();
  const { projectId = '' } = useParams();
  const fmt = useProjectDateFormat();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('tasks');
  const [sideTab, setSideTab] = useState<SideTab>('notes');
  const [activityKey, setActivityKey] = useState(0);
  const [tenantUsers, setTenantUsers] = useState<TenantUserLite[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const { folders } = useTaskFolders(token);
  const googleCalendarConnected = useGoogleCalendarConnected(token);

  const loadProject = useCallback(async () => {
    try {
      setProject(await projectsApi.getProject(token, projectId));
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [token, projectId]);

  const loadTasks = useCallback(async () => {
    try {
      setTasks(await api.listTasks(token, 'project', projectId));
    } catch (e) {
      toast.error(t('detail.actionError', { message: (e as Error).message }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, projectId]);

  useEffect(() => {
    void loadProject();
    void loadTasks();
  }, [loadProject, loadTasks]);

  useEffect(() => {
    api.listTenantUsers(token).then(setTenantUsers).catch(() => {});
  }, [token]);

  // Every change re-reads the Activity tab so the feed stays in step with what just happened.
  const changed = () => setActivityKey((k) => k + 1);
  const fail = (e: unknown) => toast.error(t('detail.actionError', { message: (e as Error).message }));

  const done = tasks.filter((x) => x.completedAt).length;

  if (loadError) {
    return (
      <div className="page-full">
        <BackLink />
        <div className="alert alert-error mt-3">{loadError.includes('not found') ? t('detail.notFound') : t('detail.loadError', { message: loadError })}</div>
      </div>
    );
  }
  if (!project) return <div className="py-16 text-center text-sm text-ink-faint dark:text-dark-ink-faint">{t('detail.loading')}</div>;

  const canEdit = project.canEdit;

  const toggleTask = async (task: Task) => {
    const completing = !task.completedAt;
    setTasks((list) => list.map((x) => (x.id === task.id ? { ...x, completedAt: completing ? new Date().toISOString() : null } : x)));
    try {
      await api.updateTask(token, task.id, { completedAt: completing ? new Date().toISOString() : null });
      const remaining = tasks.filter((x) => x.id !== task.id && !x.completedAt).length;
      if (completing && remaining === 0 && project.status !== 'completed') toast.success(t('detail.allDone'));
      changed();
    } catch (e) {
      fail(e);
    }
    void loadTasks();
  };

  const addTask = async (title: string, phaseId: string | null) => {
    try {
      await api.createTask(token, { entityType: 'project', entityId: project.id, title, assigneeId: user.id, projectPhaseId: phaseId });
      await loadTasks();
      changed();
    } catch (e) {
      fail(e);
    }
  };

  const moveTask = async (task: Task, columnKey: string) => {
    const projectPhaseId = columnKey === NO_PHASE ? null : columnKey;
    setTasks((list) => list.map((x) => (x.id === task.id ? { ...x, projectPhaseId } : x)));
    try {
      await api.updateTask(token, task.id, { projectPhaseId });
      changed();
    } catch (e) {
      fail(e);
      void loadTasks();
    }
  };

  const changeStatus = async (status: ProjectStatus) => {
    try {
      setProject(await projectsApi.updateProject(token, project.id, { status }));
      toast.success(t('detail.statusChanged', { status: t(`status.${status}`) }));
      changed();
    } catch (e) {
      fail(e);
    }
  };

  const setArchived = async (archived: boolean) => {
    try {
      setProject(await projectsApi.updateProject(token, project.id, { isActive: !archived }));
      toast.success(archived ? t('detail.archived') : t('detail.restored'));
      changed();
    } catch (e) {
      fail(e);
    }
    setConfirmArchive(false);
  };

  return (
    <div className="page-full flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <BackLink />
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="page-title !m-0">{project.name}</h2>
          <ProjectStatusChip status={project.status} />
          {canEdit && (
            <div className="ml-auto flex flex-wrap gap-2">
              <button type="button" className="btn-secondary btn-sm inline-flex items-center gap-1.5" onClick={() => setEditing(true)}>
                <PencilIcon className="h-3.5 w-3.5" />
                {t('detail.edit')}
              </button>
              {project.isActive ? (
                <button type="button" className="btn-secondary btn-sm" onClick={() => setConfirmArchive(true)}>
                  {t('detail.archive')}
                </button>
              ) : (
                <button type="button" className="btn-secondary btn-sm" onClick={() => setArchived(false)}>
                  {t('detail.unarchive')}
                </button>
              )}
            </div>
          )}
        </div>
        {!project.isActive && <div className="alert alert-warning">{t('detail.archivedBanner')}</div>}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-muted dark:text-dark-ink-muted">
          <span>
            <span className="mr-1.5 text-ink-faint dark:text-dark-ink-faint">{t('detail.company')}</span>
            {project.company ? project.company.name : t('detail.internal')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-ink-faint dark:text-dark-ink-faint">{t('detail.owner')}</span>
            <Avatar firstName={project.ownerEmployee.firstName} lastName={project.ownerEmployee.lastName} />
            {project.ownerEmployee.firstName} {project.ownerEmployee.lastName}
          </span>
          <span className="tabular-nums">
            <span className="mr-1.5 text-ink-faint dark:text-dark-ink-faint">{t('detail.dates')}</span>
            {fmt(project.startDate, true)} → {fmt(project.dueDate, true)}
          </span>
          {canEdit && (
            <label className="inline-flex items-center gap-1.5">
              <span className="text-ink-faint dark:text-dark-ink-faint">{t('detail.status')}</span>
              <select
                id="project-status-inline"
                className="!h-7 !py-0 text-sm"
                value={project.status}
                onChange={(e) => changeStatus(e.target.value as ProjectStatus)}
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="flex max-w-xl items-center gap-3">
          <div className="flex-1">
            <ProgressBar done={done} total={tasks.length} />
          </div>
          <span className="whitespace-nowrap text-sm text-ink-muted dark:text-dark-ink-muted">
            {tasks.length ? t('detail.progress', { done, total: tasks.length }) : t('detail.noTasksYet')}
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint dark:text-dark-ink-faint">
          <FolderIcon className="h-3.5 w-3.5" />
          {project.template ? t('detail.fromTemplate', { name: project.template.name }) : t('detail.blank')}
        </span>
        {project.description && <p className="max-w-3xl whitespace-pre-line text-sm text-ink-muted dark:text-dark-ink-muted">{project.description}</p>}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="overview-panel-tabs mb-3">
            <button type="button" className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>
              {t('detail.tabs.tasks')} ({tasks.length})
            </button>
            <button type="button" className={tab === 'board' ? 'active' : ''} onClick={() => setTab('board')}>
              {t('detail.tabs.board')}
            </button>
            <button type="button" className={tab === 'team' ? 'active' : ''} onClick={() => setTab('team')}>
              {t('detail.tabs.team')} ({project.members.length})
            </button>
          </div>

          {tab === 'tasks' && (
            <PhaseList
              token={token}
              project={project}
              tasks={tasks}
              canEdit={canEdit}
              onToggle={toggleTask}
              onOpen={setSelectedTask}
              onAddTask={addTask}
              onPhasesChanged={async () => {
                await Promise.all([loadProject(), loadTasks()]);
                changed();
              }}
            />
          )}
          {tab === 'board' && (
            <KanbanBoard<Task>
              columns={[
                ...(tasks.some((x) => !x.projectPhaseId) || project.phases.length === 0 ? [{ key: NO_PHASE, label: t('detail.noPhase') }] : []),
                ...project.phases.map((ph) => ({ key: ph.id, label: ph.name, color: ph.color })),
              ]}
              items={tasks}
              getItemKey={(x) => x.id}
              getItemColumn={(x) => (x.projectPhaseId && project.phases.some((ph) => ph.id === x.projectPhaseId) ? x.projectPhaseId : NO_PHASE)}
              onMove={moveTask}
              renderCard={(x) => <TaskCard task={x} onToggle={toggleTask} onOpen={setSelectedTask} />}
            />
          )}
          {tab === 'team' && (
            <TeamTab
              token={token}
              project={project}
              tasks={tasks}
              canEdit={canEdit}
              onChanged={async () => {
                await loadProject();
                changed();
              }}
            />
          )}
        </div>

        <aside className="card !p-0 min-w-0 overflow-hidden">
          <div className="overview-panel-tabs px-3 pt-2">
            <button type="button" className={sideTab === 'notes' ? 'active' : ''} onClick={() => setSideTab('notes')}>
              {t('detail.side.notes')}
            </button>
            <button type="button" className={sideTab === 'activity' ? 'active' : ''} onClick={() => setSideTab('activity')}>
              {t('detail.side.activity')}
            </button>
          </div>
          <div className="max-h-[640px] overflow-y-auto p-3">
            {sideTab === 'notes' ? (
              <EntityNotesList token={token} entityType="project" entityId={project.id} />
            ) : (
              <EntityActivityList key={activityKey} token={token} entityType="project" entityId={project.id} />
            )}
          </div>
        </aside>
      </div>

      <TaskDetailModal
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        token={token}
        tenantUsers={tenantUsers}
        currentUserId={user.id}
        folders={folders}
        googleCalendarConnected={googleCalendarConnected}
        onSaved={async () => {
          setSelectedTask(null);
          await loadTasks();
          changed();
        }}
      />
      <ProjectFormModal
        open={editing}
        token={token}
        project={project}
        onClose={() => setEditing(false)}
        onSaved={(p) => {
          setProject(p);
          setEditing(false);
          toast.success(t('detail.saved'));
          changed();
        }}
      />
      {confirmArchive && (
        <ConfirmDialog
          title={t('detail.archiveTitle', { name: project.name })}
          message={t('detail.archiveBody')}
          confirmLabel={t('detail.archive')}
          onConfirm={() => setArchived(true)}
          onCancel={() => setConfirmArchive(false)}
        />
      )}
    </div>
  );
}

function BackLink() {
  const { t } = useTranslation('projects');
  return (
    <Link to="/projects" className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted hover:text-accent dark:text-dark-ink-muted">
      <ChevronLeftIcon className="h-4 w-4" />
      {t('detail.back')}
    </Link>
  );
}

// ---------- tasks by phase ----------

function TaskCheck({ task, onToggle }: { task: Task; onToggle: (task: Task) => void }) {
  const { t } = useTranslation('projects');
  const completed = !!task.completedAt;
  return (
    <button
      type="button"
      className={`task-check-circle ${completed ? 'done' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(task);
      }}
      aria-pressed={completed}
      aria-label={completed ? t('detail.markPending') : t('detail.markComplete')}
    >
      <TaskCheckIcon />
    </button>
  );
}

function TaskDue({ task }: { task: Task }) {
  const { t } = useTranslation('projects');
  const fmt = useProjectDateFormat();
  const late = !task.completedAt && isPastDue(task.dueDate);
  return (
    <span className={`whitespace-nowrap text-xs tabular-nums ${late ? 'font-semibold text-red-600 dark:text-red-400' : 'text-ink-muted dark:text-dark-ink-muted'}`}>
      {task.dueDate ? fmt(task.dueDate) : t('detail.noDueDate')}
    </span>
  );
}

function TaskRow({ task, onToggle, onOpen }: { task: Task; onToggle: (task: Task) => void; onOpen: (task: Task) => void }) {
  const completed = !!task.completedAt;
  return (
    <li
      className="grid cursor-pointer grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-line-soft px-3 py-2 last:border-b-0 hover:bg-surface-2 sm:grid-cols-[22px_minmax(0,1fr)_minmax(0,160px)_72px] dark:border-dark-line-soft dark:hover:bg-dark-raised"
      onClick={() => onOpen(task)}
    >
      <TaskCheck task={task} onToggle={onToggle} />
      <span className={`min-w-0 break-words text-sm ${completed ? 'text-ink-faint line-through dark:text-dark-ink-faint' : ''}`}>{task.title}</span>
      <span className="col-start-2 row-start-2 inline-flex min-w-0 items-center gap-1.5 text-xs text-ink-muted sm:col-start-auto sm:row-start-auto dark:text-dark-ink-muted">
        {task.assignee && (
          <>
            <Avatar firstName={task.assignee.firstName} lastName={task.assignee.lastName} />
            <span className="truncate">
              {task.assignee.firstName} {task.assignee.lastName}
            </span>
          </>
        )}
      </span>
      <span className="text-right">
        <TaskDue task={task} />
      </span>
    </li>
  );
}

function TaskCard({ task, onToggle, onOpen }: { task: Task; onToggle: (task: Task) => void; onOpen: (task: Task) => void }) {
  const completed = !!task.completedAt;
  return (
    <div onClick={() => onOpen(task)}>
      <div className="kcard-top">
        <TaskCheck task={task} onToggle={onToggle} />
        <span className={`kc-name flex-1 font-normal ${completed ? 'line-through opacity-60' : ''}`}>{task.title}</span>
      </div>
      <div className="kcard-foot mt-1.5 justify-between">
        <TaskDue task={task} />
        {task.assignee && <Avatar firstName={task.assignee.firstName} lastName={task.assignee.lastName} />}
      </div>
    </div>
  );
}

function AddTaskInput({ id, label, onAdd }: { id: string; label: string; onAdd: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    await onAdd(title.trim());
    setTitle('');
    setBusy(false);
    document.getElementById(id)?.focus();
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-2 px-3 py-1.5">
      <PlusIcon className="h-3.5 w-3.5 shrink-0 text-ink-faint dark:text-dark-ink-faint" />
      <input
        id={id}
        className="!h-8 w-full min-w-0 flex-1 !border-0 !bg-transparent !px-1 text-sm !shadow-none"
        placeholder={label}
        aria-label={label}
        value={title}
        maxLength={300}
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
      />
    </form>
  );
}

interface PhaseListProps {
  token: string;
  project: ProjectDetail;
  tasks: Task[];
  canEdit: boolean;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
  onAddTask: (title: string, phaseId: string | null) => Promise<void>;
  onPhasesChanged: () => Promise<void>;
}

function PhaseList({ token, project, tasks, canEdit, onToggle, onOpen, onAddTask, onPhasesChanged }: PhaseListProps) {
  const { t } = useTranslation('projects');
  const toast = useToast();
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<ProjectPhase | null>(null);
  const [newPhase, setNewPhase] = useState('');
  const fail = (e: unknown) => toast.error(t('detail.actionError', { message: (e as Error).message }));

  const phaseIds = new Set(project.phases.map((p) => p.id));
  const loose = tasks.filter((x) => !x.projectPhaseId || !phaseIds.has(x.projectPhaseId));
  const groups: { phase: ProjectPhase | null; tasks: Task[] }[] = [
    ...project.phases.map((phase) => ({ phase, tasks: tasks.filter((x) => x.projectPhaseId === phase.id) })),
    ...(loose.length || project.phases.length === 0 ? [{ phase: null, tasks: loose }] : []),
  ];

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    try {
      await fn();
      if (success) toast.success(success);
      await onPhasesChanged();
    } catch (e) {
      fail(e);
    }
  };

  const move = (index: number, delta: number) => {
    const ids = project.phases.map((p) => p.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved);
    return run(() => projectsApi.reorderProjectPhases(token, project.id, ids));
  };

  const addPhase = (e: FormEvent) => {
    e.preventDefault();
    const name = newPhase.trim();
    if (!name) return;
    setNewPhase('');
    void run(() => projectsApi.createProjectPhase(token, project.id, { name }), t('detail.phaseAdded'));
  };

  return (
    <div className="flex flex-col gap-3">
      {project.phases.length === 0 && tasks.length === 0 && (
        <div className="table-empty">
          <span className="table-empty-icon">
            <FolderIcon />
          </span>
          <div className="table-empty-text">
            <span className="table-empty-title">{t('detail.noPhasesTitle')}</span>
            <span className="table-empty-body">{t('detail.noPhasesBody')}</span>
          </div>
        </div>
      )}
      {groups.map(({ phase, tasks: phaseTasks }, index) => {
        const doneCount = phaseTasks.filter((x) => x.completedAt).length;
        const label = phase ? phase.name : t('detail.noPhase');
        return (
          <section key={phase?.id ?? 'none'} className="card !p-0 overflow-hidden">
            <header className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-3 py-2 dark:border-dark-line dark:bg-dark-raised">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: phase?.color ?? '#a8a3bd' }} />
              {renaming && phase && renaming.id === phase.id ? (
                <form
                  className="flex-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = renaming.name.trim();
                    setRenaming(null);
                    if (name && name !== phase.name) void run(() => projectsApi.updateProjectPhase(token, project.id, phase.id, { name }));
                  }}
                >
                  <input
                    id={`phase-rename-${phase.id}`}
                    className="!h-7 text-sm"
                    value={renaming.name}
                    aria-label={t('detail.renamePhase')}
                    autoFocus
                    maxLength={200}
                    onChange={(e) => setRenaming({ id: phase.id, name: e.target.value })}
                    onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                  />
                </form>
              ) : (
                <h3 className="m-0 text-sm font-semibold">{label}</h3>
              )}
              <span className="text-xs tabular-nums text-ink-faint dark:text-dark-ink-faint">
                {doneCount}/{phaseTasks.length}
              </span>
              {phaseTasks.length > 0 && doneCount === phaseTasks.length && (
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{t('detail.phaseDone')}</span>
              )}
              {canEdit && phase && (
                <div className="ml-auto flex items-center gap-0.5">
                  <button type="button" className="icon-btn" disabled={index === 0} aria-label={`${t('detail.moveUp')} · ${phase.name}`} onClick={() => move(index, -1)}>
                    <ChevronDownIcon className="h-4 w-4 rotate-180" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={index === project.phases.length - 1}
                    aria-label={`${t('detail.moveDown')} · ${phase.name}`}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDownIcon className="h-4 w-4" />
                  </button>
                  <button type="button" className="icon-btn" aria-label={`${t('detail.renamePhase')} · ${phase.name}`} onClick={() => setRenaming({ id: phase.id, name: phase.name })}>
                    <PencilIcon />
                  </button>
                  <button type="button" className="icon-btn" aria-label={`${t('detail.deletePhase')} · ${phase.name}`} onClick={() => setDeleting(phase)}>
                    <TrashIcon />
                  </button>
                </div>
              )}
            </header>
            <ul className="m-0 list-none p-0">
              {phaseTasks.map((task) => (
                <TaskRow key={task.id} task={task} onToggle={onToggle} onOpen={onOpen} />
              ))}
            </ul>
            <div className="border-t border-line-soft dark:border-dark-line-soft">
              <AddTaskInput
                id={`add-task-${phase?.id ?? 'none'}`}
                label={phase ? t('detail.addTaskTo', { phase: phase.name }) : t('detail.addTask')}
                onAdd={(title) => onAddTask(title, phase?.id ?? null)}
              />
            </div>
          </section>
        );
      })}
      {canEdit && (
        <form onSubmit={addPhase} className="flex items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-1.5 dark:border-dark-line">
          <PlusIcon className="h-3.5 w-3.5 shrink-0 text-ink-faint dark:text-dark-ink-faint" />
          <input
            id="add-phase"
            className="!h-8 w-full min-w-0 flex-1 !border-0 !bg-transparent !px-1 text-sm !shadow-none"
            placeholder={t('detail.addPhase')}
            aria-label={t('detail.addPhase')}
            value={newPhase}
            maxLength={200}
            onChange={(e) => setNewPhase(e.target.value)}
          />
        </form>
      )}
      {deleting && (
        <ConfirmDialog
          title={t('detail.deletePhaseTitle', { name: deleting.name })}
          message={t('detail.deletePhaseBody')}
          confirmLabel={t('detail.deletePhase')}
          danger
          onConfirm={() => {
            const phase = deleting;
            setDeleting(null);
            void run(() => projectsApi.deleteProjectPhase(token, project.id, phase.id), t('detail.phaseDeleted'));
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

// ---------- team ----------

function TeamTab({ token, project, tasks, canEdit, onChanged }: { token: string; project: ProjectDetail; tasks: Task[]; canEdit: boolean; onChanged: () => Promise<void> }) {
  const { t } = useTranslation('projects');
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ProjectMember | null>(null);
  const [employees, setEmployees] = useState<ProjectOptionEmployee[]>([]);
  const [draft, setDraft] = useState({ employeeId: '', projectRole: '' });
  const [roles, setRoles] = useState<Record<string, string>>({});
  const fail = (e: unknown) => toast.error(t('detail.actionError', { message: (e as Error).message }));

  useEffect(() => {
    setRoles(Object.fromEntries(project.members.map((m) => [m.id, m.projectRole ?? ''])));
  }, [project.members]);

  const openAdd = async () => {
    setDraft({ employeeId: '', projectRole: '' });
    setAdding(true);
    try {
      setEmployees((await projectsApi.getProjectOptions(token, project.id)).employees);
    } catch (e) {
      fail(e);
    }
  };

  const openTasksOf = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) if (!task.completedAt) counts.set(task.assigneeId, (counts.get(task.assigneeId) ?? 0) + 1);
    return counts;
  }, [tasks]);

  const name = (m: ProjectMember) => `${m.employee.firstName} ${m.employee.lastName}`;
  const available = employees.filter((e) => !project.members.some((m) => m.employeeId === e.id));

  const saveRole = async (m: ProjectMember) => {
    const value = (roles[m.id] ?? '').trim();
    if (value === (m.projectRole ?? '')) return;
    try {
      await projectsApi.updateProjectMember(token, project.id, m.id, value || null);
      toast.success(t('detail.saved'));
      await onChanged();
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="full-table-wrap">
        <table className="table full-table !mt-0">
          <thead>
            <tr>
              <th>{t('detail.team.person')}</th>
              <th>{t('detail.team.jobTitle')}</th>
              <th>{t('detail.team.role')}</th>
              <th>{t('detail.team.openTasks')}</th>
              <th>{t('detail.team.access')}</th>
              {canEdit && <th aria-label={t('detail.team.remove')} />}
            </tr>
          </thead>
          <TableBody
            colSpan={canEdit ? 6 : 5}
            isEmpty={project.members.length === 0}
            empty={{ icon: <PeopleIcon />, title: t('detail.team.emptyTitle') }}
            onAdd={canEdit ? openAdd : undefined}
            addLabel={t('detail.team.add')}
          >
            {project.members.map((m) => {
              const isOwner = m.employeeId === project.ownerEmployee.id;
              return (
                <tr key={m.id}>
                  <td>
                    <span className="inline-flex items-center gap-2">
                      <Avatar firstName={m.employee.firstName} lastName={m.employee.lastName} />
                      <span className="min-w-0">
                        <span className="block truncate">{name(m)}</span>
                        {isOwner && <span className="block text-[11px] font-semibold text-accent">{t('detail.team.ownerTag')}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="text-ink-muted dark:text-dark-ink-muted">{m.employee.jobTitleDefn?.name ?? '—'}</td>
                  <td>
                    {canEdit ? (
                      <input
                        id={`member-role-${m.id}`}
                        className="!h-8 w-full min-w-0 text-sm"
                        aria-label={`${t('detail.team.role')} · ${name(m)}`}
                        value={roles[m.id] ?? ''}
                        maxLength={80}
                        onChange={(e) => setRoles({ ...roles, [m.id]: e.target.value })}
                        onBlur={() => saveRole(m)}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      />
                    ) : (
                      (m.projectRole ?? '—')
                    )}
                  </td>
                  <td className="tabular-nums">{m.employee.userId ? (openTasksOf.get(m.employee.userId) ?? 0) : '—'}</td>
                  <td>
                    {m.employee.userId ? (
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{t('detail.team.hasAccess')}</span>
                    ) : (
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-400" title={t('detail.team.noAccess')}>
                        {t('detail.team.noAccessShort')}
                      </span>
                    )}
                  </td>
                  {canEdit && (
                    <td>
                      {!isOwner && (
                        <button type="button" className="icon-btn" aria-label={`${t('detail.team.remove')} · ${name(m)}`} onClick={() => setRemoving(m)}>
                          <TrashIcon />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </TableBody>
        </table>
      </div>
      <p className="text-xs text-ink-faint dark:text-dark-ink-faint">{t('detail.team.note')}</p>

      <Modal
        open={adding}
        title={t('detail.team.addTitle')}
        onClose={() => setAdding(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>
              {t('form.cancel')}
            </button>
            <button type="submit" form="project-add-member" className="btn-primary" disabled={!draft.employeeId}>
              {t('detail.team.add')}
            </button>
          </>
        }
      >
        <form
          id="project-add-member"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!draft.employeeId) return;
            try {
              await projectsApi.addProjectMember(token, project.id, { employeeId: draft.employeeId, projectRole: draft.projectRole.trim() || null });
              const person = employees.find((x) => x.id === draft.employeeId);
              toast.success(t('detail.team.added', { name: person ? `${person.firstName} ${person.lastName}` : '' }));
              setAdding(false);
              await onChanged();
            } catch (err) {
              fail(err);
            }
          }}
        >
          <div className="form-group">
            <label htmlFor="add-member-employee">{t('form.member')}</label>
            <select id="add-member-employee" value={draft.employeeId} onChange={(e) => setDraft({ ...draft, employeeId: e.target.value })} autoFocus>
              <option value="">{t('form.choosePerson')}</option>
              {available.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                  {e.hasLogin ? '' : ` (${t('form.noLogin')})`}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="add-member-role">{t('form.role')}</label>
            <input
              id="add-member-role"
              value={draft.projectRole}
              maxLength={80}
              placeholder={t('form.rolePlaceholder')}
              onChange={(e) => setDraft({ ...draft, projectRole: e.target.value })}
            />
          </div>
        </form>
      </Modal>

      {removing && (
        <ConfirmDialog
          title={t('detail.team.removeTitle', { name: name(removing) })}
          message={t('detail.team.removeBody')}
          confirmLabel={t('detail.team.remove')}
          danger
          onConfirm={async () => {
            const m = removing;
            setRemoving(null);
            try {
              await projectsApi.removeProjectMember(token, project.id, m.id);
              toast.success(t('detail.team.removed', { name: name(m) }));
              await onChanged();
            } catch (e) {
              fail(e);
            }
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
