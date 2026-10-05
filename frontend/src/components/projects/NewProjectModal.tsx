import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../common/Modal';
import ConfirmDialog from '../common/ConfirmDialog';
import RequiredMark from '../common/RequiredMark';
import { LockIcon, TrashIcon } from '../common/Icons';
import { useToast } from '../common/ToastProvider';
import { usePermissions } from '../../contexts/PermissionsContext';
import {
  projectsApi,
  type ProjectDetail,
  type ProjectLimits,
  type ProjectOptions,
  type ProjectStatus,
  type ProjectTemplateDetail,
  type ProjectTemplateNiche,
  type ProjectTemplateSummary,
} from '../../api/projects';
import { toLocalCalendarDate } from '../../lib/taskHubDates';

// Projects module, unit 5 (prototype approved by Alejandro) — "New project" in two steps:
// 1) the starting point: blank, a system template by niche, or one of the tenant's own templates;
// 2) for a template: name, company, owner, start date and who fills each of the template's roles,
//    with a live preview of every task's date and assignee. "Blank" hands off to ProjectFormModal.
// The preview applies the same rule the backend uses (projectTemplateService.ts's
// resolveTemplateAssignee): the role's person if they have a login, else the owner, else you.

type NicheFilter = 'all' | ProjectTemplateNiche;
const NICHE_FILTERS: NicheFilter[] = ['all', 'accounting', 'agency', 'consulting', 'internal', 'custom'];
const FALLBACK_COLOR = '#a8a3bd';

interface NewProjectModalProps {
  open: boolean;
  token: string;
  limits: ProjectLimits | null;
  defaultCompanyId?: string | null;
  onClose: () => void;
  onBlank: () => void;
  onCreated: (project: ProjectDetail) => void;
}

export default function NewProjectModal({ open, token, limits, defaultCompanyId, onClose, onBlank, onCreated }: NewProjectModalProps) {
  const { t, i18n } = useTranslation('projects');
  const toast = useToast();
  const { features } = usePermissions();
  const customAllowed = limits?.customTemplatesEnabled ?? features.projectTemplates ?? true;
  const atLimit = !!limits && limits.maxActiveProjects !== null && limits.openCount >= limits.maxActiveProjects;

  const [templates, setTemplates] = useState<ProjectTemplateSummary[] | null>(null);
  const [niche, setNiche] = useState<NicheFilter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [deleting, setDeleting] = useState<ProjectTemplateSummary | null>(null);

  const loadTemplates = () =>
    projectsApi
      .listProjectTemplates(token, i18n.language === 'es' ? 'es' : 'en')
      .then((r) => setTemplates(r.templates))
      .catch((e) => toast.error(t('new.loadError', { message: (e as Error).message })));

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSelected(null);
    setNiche('all');
    void loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token, i18n.language]);

  const shown = useMemo(() => {
    const list = templates ?? [];
    if (niche === 'all') return list.filter((x) => x.isSystem || customAllowed);
    return list.filter((x) => x.niche === niche);
  }, [templates, niche, customAllowed]);

  const continueFromPick = () => {
    if (selected === 'blank') {
      onBlank();
      return;
    }
    if (selected) setStep(2);
  };

  if (step === 2 && selected && selected !== 'blank') {
    return (
      <TemplateDetailsStep
        open={open}
        token={token}
        templateId={selected}
        defaultCompanyId={defaultCompanyId}
        onBack={() => setStep(1)}
        onClose={onClose}
        onCreated={onCreated}
      />
    );
  }

  return (
    <Modal
      open={open}
      title={t('new.title')}
      onClose={onClose}
      xwide
      footer={
        <>
          <span className="mr-auto hidden text-xs text-ink-faint sm:inline dark:text-dark-ink-faint">{t('new.hint')}</span>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('form.cancel')}
          </button>
          <button type="button" className="btn-primary" disabled={!selected || atLimit} onClick={continueFromPick}>
            {t('new.continue')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Steps step={1} />
        {atLimit && (
          <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <div className="font-semibold">{t('new.atLimitTitle', { max: limits!.maxActiveProjects })}</div>
            <div>{t('new.atLimitBody')}</div>
          </div>
        )}
        <div className="task-view-toggle flex-wrap self-start" role="group">
          {NICHE_FILTERS.map((n) => (
            <button
              key={n}
              type="button"
              className={niche === n ? 'active' : ''}
              onClick={() => {
                setNiche(n);
                if (selected !== 'blank') setSelected(null);
              }}
            >
              {t(`new.niches.${n}`)}
            </button>
          ))}
        </div>

        {niche === 'custom' && !customAllowed ? (
          <div className="flex items-start gap-3 rounded-lg border border-dashed border-line-strong p-4 text-sm dark:border-dark-line">
            <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
            <div>
              <div className="font-semibold">{t('new.lockedTitle')}</div>
              <div className="text-ink-muted dark:text-dark-ink-muted">{t('new.lockedBody')}</div>
            </div>
          </div>
        ) : niche === 'custom' && templates && shown.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong p-4 text-sm dark:border-dark-line">
            <div className="font-semibold">{t('new.noOwnTitle')}</div>
            <div className="text-ink-muted dark:text-dark-ink-muted">{t('new.noOwnBody')}</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {niche === 'all' && (
              <TemplateCard
                tag={t('new.blankTag')}
                title={t('new.blankTitle')}
                body={t('new.blankBody')}
                dashed
                selected={selected === 'blank'}
                onSelect={() => setSelected('blank')}
              />
            )}
            {templates === null
              ? Array.from({ length: 5 }, (_, i) => <div key={i} className="h-[132px] animate-pulse rounded-lg bg-surface-2 dark:bg-dark-raised" />)
              : shown.map((tpl) => (
                  <TemplateCard
                    key={tpl.id}
                    tag={t(`new.niches.${tpl.niche}`)}
                    title={tpl.name}
                    body={tpl.description ?? ''}
                    colors={tpl.phases.map((p) => p.color ?? FALLBACK_COLOR)}
                    meta={t('new.meta', { phases: tpl.phases.length, tasks: tpl.taskCount, roles: tpl.roles.length })}
                    selected={selected === tpl.id}
                    onSelect={() => setSelected(tpl.id)}
                    onDelete={tpl.isSystem ? undefined : () => setDeleting(tpl)}
                    deleteLabel={`${t('new.deleteTemplate')} · ${tpl.name}`}
                  />
                ))}
          </div>
        )}
      </div>
      {deleting && (
        <ConfirmDialog
          title={t('new.deleteTemplateTitle', { name: deleting.name })}
          message={t('new.deleteTemplateBody')}
          confirmLabel={t('new.deleteTemplate')}
          danger
          onConfirm={async () => {
            const tpl = deleting;
            setDeleting(null);
            try {
              await projectsApi.deleteProjectTemplate(token, tpl.id);
              if (selected === tpl.id) setSelected(null);
              toast.success(t('new.templateDeleted'));
              await loadTemplates();
            } catch (e) {
              toast.error(t('detail.actionError', { message: (e as Error).message }));
            }
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Modal>
  );
}

function Steps({ step }: { step: 1 | 2 }) {
  const { t } = useTranslation('projects');
  return (
    <div className="flex items-center gap-2 text-xs text-ink-faint dark:text-dark-ink-faint">
      <span className={step === 1 ? 'font-semibold text-accent dark:text-brand-blue-light' : ''}>{t('new.stepPick')}</span>
      <span aria-hidden="true">›</span>
      <span className={step === 2 ? 'font-semibold text-accent dark:text-brand-blue-light' : ''}>{t('new.stepDetails')}</span>
    </div>
  );
}

interface TemplateCardProps {
  tag: string;
  title: string;
  body: string;
  meta?: string;
  colors?: string[];
  dashed?: boolean;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
}

function TemplateCard({ tag, title, body, meta, colors, dashed, selected, onSelect, onDelete, deleteLabel }: TemplateCardProps) {
  return (
    <div
      className={`relative flex flex-col gap-2 rounded-lg border bg-surface-1 p-3 text-left transition dark:bg-dark-surface ${
        selected
          ? 'border-accent ring-2 ring-accent-tint dark:border-brand-blue-light dark:ring-brand-blue-light/20'
          : `${dashed ? 'border-dashed' : ''} border-line hover:border-accent dark:border-dark-line dark:hover:border-brand-blue-light`
      }`}
    >
      <button type="button" className="absolute inset-0 rounded-lg" aria-pressed={selected} aria-label={title} onClick={onSelect} />
      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-accent dark:text-brand-blue-light">{tag}</span>
      <span className="pr-6 text-sm font-semibold">{title}</span>
      {body && <span className="text-xs text-ink-muted dark:text-dark-ink-muted">{body}</span>}
      {colors && colors.length > 0 && (
        <span className="mt-auto flex gap-1" aria-hidden="true">
          {colors.map((c, i) => (
            <i key={i} className="h-1 flex-1 rounded-full" style={{ backgroundColor: c }} />
          ))}
        </span>
      )}
      {meta && <span className="text-[11.5px] text-ink-faint dark:text-dark-ink-faint">{meta}</span>}
      {onDelete && (
        <span className="absolute right-2 top-2 z-10">
          <button type="button" className="icon-btn" aria-label={deleteLabel} onClick={onDelete}>
            <TrashIcon />
          </button>
        </span>
      )}
    </div>
  );
}

// ---------- step 2 ----------

const roleKey = (role: string) => role.trim().toLocaleLowerCase();

function addDays(dateInput: string, days: number): string {
  const d = new Date(`${dateInput}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

interface TemplateDetailsStepProps {
  open: boolean;
  token: string;
  templateId: string;
  defaultCompanyId?: string | null;
  onBack: () => void;
  onClose: () => void;
  onCreated: (project: ProjectDetail) => void;
}

function TemplateDetailsStep({ open, token, templateId, defaultCompanyId, onBack, onClose, onCreated }: TemplateDetailsStepProps) {
  const { t, i18n } = useTranslation('projects');
  const locale = i18n.language === 'es' ? 'es-AR' : 'en-US';
  const [template, setTemplate] = useState<ProjectTemplateDetail | null>(null);
  const [options, setOptions] = useState<ProjectOptions | null>(null);
  const [name, setName] = useState('');
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? '');
  const [ownerEmployeeId, setOwnerEmployeeId] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [roleMap, setRoleMap] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([projectsApi.getProjectTemplate(token, templateId), projectsApi.getProjectOptions(token)])
      .then(([tpl, opts]) => {
        setTemplate(tpl);
        setOptions(opts);
        setName(tpl.name);
        if (opts.ownEmployeeId) setOwnerEmployeeId(opts.ownEmployeeId);
        // Pre-fill each role with the one person whose job title matches it, when there's exactly one.
        const map: Record<string, string> = {};
        for (const role of tpl.roles) {
          const matches = opts.employees.filter((e) => e.jobTitle && roleKey(e.jobTitle) === roleKey(role));
          map[role] = matches.length === 1 ? matches[0].id : '';
        }
        setRoleMap(map);
      })
      .catch((e) => setError((e as Error).message));
  }, [token, templateId]);

  const employees = useMemo(() => options?.employees ?? [], [options]);
  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const companyName = options?.companies.find((c) => c.id === companyId)?.name;

  // Same rule as the backend (resolveTemplateAssignee).
  const assigneeFor = (role: string | null): { label: string; fallback: boolean } => {
    if (role) {
      const person = byId.get(roleMap[role] ?? '');
      if (person?.hasLogin) return { label: `${person.firstName} ${person.lastName}`, fallback: false };
    }
    const owner = byId.get(ownerEmployeeId);
    if (owner?.hasLogin) return { label: `${owner.firstName} ${owner.lastName}`, fallback: !!role };
    return { label: t('new.you'), fallback: true };
  };

  const fmtDay = (offset: number | null) =>
    offset === null ? t('detail.noDueDate') : toLocalCalendarDate(addDays(startDate, offset)).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t('form.nameRequired'));
    if (!ownerEmployeeId) return setError(t('form.ownerRequired'));
    setError(null);
    setSaving(true);
    try {
      const project = await projectsApi.createProjectFromTemplate(token, {
        templateId,
        name: name.trim(),
        companyId: companyId || null,
        ownerEmployeeId,
        startDate: startDate || null,
        status,
        members: Object.entries(roleMap)
          .filter(([, employeeId]) => employeeId)
          .map(([projectRole, employeeId]) => ({ employeeId, projectRole })),
      });
      onCreated(project);
    } catch (err) {
      setError(t('form.saveError', { message: (err as Error).message }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={template ? `${t('new.title')} · ${template.name}` : t('new.title')}
      onClose={onClose}
      xwide
      footer={
        <>
          <button type="button" className="btn-secondary mr-auto" onClick={onBack}>
            {t('new.back')}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('form.cancel')}
          </button>
          <button type="submit" form="project-from-template" className="btn-primary" disabled={saving || !template}>
            {t('new.create')}
          </button>
        </>
      }
    >
      <form id="project-from-template" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Steps step={2} />
        {error && <div className="alert alert-error">{error}</div>}
        {!template ? (
          <div className="py-10 text-center text-sm text-ink-faint dark:text-dark-ink-faint">{t('detail.loading')}</div>
        ) : (
          <>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <div className="form-group min-w-0 sm:col-span-2">
                <label htmlFor="tpl-project-name">
                  {t('form.name')}
                  <RequiredMark />
                </label>
                <input id="tpl-project-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="form-group min-w-0">
                <label htmlFor="tpl-project-company">{t('form.company')}</label>
                <select
                  id="tpl-project-company"
                  value={companyId}
                  onChange={(e) => {
                    const next = e.target.value;
                    const nextName = options?.companies.find((c) => c.id === next)?.name;
                    // Keep "Template · Company" in step with the company while the name is untouched.
                    if (name === template.name || (companyName && name === `${template.name} · ${companyName}`)) {
                      setName(nextName ? `${template.name} · ${nextName}` : template.name);
                    }
                    setCompanyId(next);
                  }}
                >
                  <option value="">{t('form.noCompany')}</option>
                  {(options?.companies ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group min-w-0">
                <label htmlFor="tpl-project-owner">
                  {t('form.owner')}
                  <RequiredMark />
                </label>
                <select id="tpl-project-owner" value={ownerEmployeeId} onChange={(e) => setOwnerEmployeeId(e.target.value)}>
                  <option value="">{t('form.choosePerson')}</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.firstName} {e.lastName}
                      {e.hasLogin ? '' : ` (${t('form.noLogin')})`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group min-w-0">
                <label htmlFor="tpl-project-start">{t('form.startDate')}</label>
                <input id="tpl-project-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="form-group min-w-0">
                <label htmlFor="tpl-project-status">{t('form.status')}</label>
                <select id="tpl-project-status" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
                  <option value="active">{t('status.active')}</option>
                  <option value="planning">{t('status.planning')}</option>
                </select>
              </div>
            </div>

            {template.roles.length > 0 && (
              <section className="form-group m-0">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-dark-ink-faint">{t('new.rolesTitle')}</h3>
                <div className="flex flex-col gap-2">
                  {template.roles.map((role, i) => {
                    const person = byId.get(roleMap[role] ?? '');
                    return (
                      <div key={role} className="grid items-center gap-x-3 gap-y-1 sm:grid-cols-[170px_minmax(0,1fr)_110px]">
                        <label htmlFor={`tpl-role-${i}`} className="!m-0 text-sm font-semibold">
                          {role}
                        </label>
                        <select id={`tpl-role-${i}`} value={roleMap[role] ?? ''} onChange={(e) => setRoleMap({ ...roleMap, [role]: e.target.value })}>
                          <option value="">{t('new.roleUnassigned')}</option>
                          {employees.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.firstName} {e.lastName}
                              {e.hasLogin ? '' : ` (${t('form.noLogin')})`}
                            </option>
                          ))}
                        </select>
                        <span className="text-xs">
                          {person &&
                            (person.hasLogin ? (
                              <span className="font-medium text-emerald-700 dark:text-emerald-400">{t('detail.team.hasAccess')}</span>
                            ) : (
                              <span className="font-medium text-amber-700 dark:text-amber-400">{t('detail.team.noAccessShort')}</span>
                            ))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-dark-ink-faint">
                {t('new.previewTitle', { count: template.taskCount })}
              </h3>
              <div className="overflow-hidden rounded-lg border border-line dark:border-dark-line">
                {template.phases.map((phase) => (
                  <div key={phase.id}>
                    <div className="flex items-center gap-2 bg-surface-2 px-3 py-1.5 text-xs font-semibold dark:bg-dark-raised">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: phase.color ?? FALLBACK_COLOR }} />
                      {phase.name}
                    </div>
                    {phase.tasks.map((task) => {
                      const who = assigneeFor(task.projectRole);
                      return (
                        <div
                          key={task.id}
                          className="grid grid-cols-[minmax(0,1fr)_auto_64px] items-center gap-3 border-t border-line-soft px-3 py-1.5 text-[13px] dark:border-dark-line-soft"
                        >
                          <span className="min-w-0">
                            {task.title}
                            {who.fallback && (
                              <span className="block text-[11px] text-amber-700 dark:text-amber-400">
                                {task.projectRole ? t('new.fallbackRole', { role: task.projectRole }) : t('new.fallbackNoRole')}
                              </span>
                            )}
                          </span>
                          <span className="truncate text-xs text-ink-muted dark:text-dark-ink-muted">{who.label}</span>
                          <span className="text-right text-xs tabular-nums text-ink-muted dark:text-dark-ink-muted">{fmtDay(task.dueOffsetDays)}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </form>
    </Modal>
  );
}
