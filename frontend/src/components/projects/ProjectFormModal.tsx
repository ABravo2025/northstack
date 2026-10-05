import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../common/Modal';
import RequiredMark from '../common/RequiredMark';
import { TrashIcon } from '../common/Icons';
import { useToast } from '../common/ToastProvider';
import {
  PROJECT_STATUSES,
  projectsApi,
  type ProjectDetail,
  type ProjectMemberInput,
  type ProjectOptions,
  type ProjectStatus,
} from '../../api/projects';
import { toDateInput } from './projectUi';

interface ProjectFormModalProps {
  open: boolean;
  token: string;
  // Absent = create a blank project; present = edit its details (team and phases are edited in
  // the project's own page, not here).
  project?: ProjectDetail | null;
  defaultCompanyId?: string | null;
  onClose: () => void;
  onSaved: (project: ProjectDetail) => void;
}

interface FormState {
  name: string;
  description: string;
  companyId: string;
  ownerEmployeeId: string;
  startDate: string;
  dueDate: string;
  status: ProjectStatus;
  members: ProjectMemberInput[];
}

function initialState(project: ProjectDetail | null | undefined, defaultCompanyId: string | null | undefined): FormState {
  return {
    name: project?.name ?? '',
    description: project?.description ?? '',
    companyId: project?.company?.id ?? defaultCompanyId ?? '',
    ownerEmployeeId: project?.ownerEmployee.id ?? '',
    startDate: toDateInput(project?.startDate) || (project ? '' : new Date().toISOString().slice(0, 10)),
    dueDate: toDateInput(project?.dueDate),
    status: project?.status ?? 'active',
    members: [],
  };
}

export default function ProjectFormModal({ open, token, project, defaultCompanyId, onClose, onSaved }: ProjectFormModalProps) {
  const { t } = useTranslation('projects');
  const toast = useToast();
  const isEdit = !!project;
  const [form, setForm] = useState<FormState>(() => initialState(project, defaultCompanyId));
  const [options, setOptions] = useState<ProjectOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initialState(project, defaultCompanyId));
    setError(null);
    projectsApi
      .getProjectOptions(token, project?.id)
      .then((opts) => {
        setOptions(opts);
        // A new project defaults to its creator as owner, when they have an Employee record.
        if (!project && opts.ownEmployeeId) setForm((f) => (f.ownerEmployeeId ? f : { ...f, ownerEmployeeId: opts.ownEmployeeId! }));
      })
      .catch((e) => toast.error(t('form.loadOptionsError', { message: (e as Error).message })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id, token]);

  const employees = options?.employees ?? [];
  const personLabel = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName}` : '';
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError(t('form.nameRequired'));
    if (!form.ownerEmployeeId) return setError(t('form.ownerRequired'));
    if (form.startDate && form.dueDate && form.dueDate < form.startDate) return setError(t('form.datesOrder'));
    setError(null);
    setSaving(true);
    const data = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      companyId: form.companyId || null,
      ownerEmployeeId: form.ownerEmployeeId,
      startDate: form.startDate || null,
      dueDate: form.dueDate || null,
      status: form.status,
    };
    try {
      const saved = isEdit
        ? await projectsApi.updateProject(token, project!.id, data)
        : await projectsApi.createProject(token, { ...data, members: form.members.filter((m) => m.employeeId) });
      onSaved(saved);
    } catch (err) {
      setError(t('form.saveError', { message: (err as Error).message }));
    } finally {
      setSaving(false);
    }
  };

  const setMember = (index: number, patch: Partial<ProjectMemberInput>) =>
    setForm((f) => ({ ...f, members: f.members.map((m, i) => (i === index ? { ...m, ...patch } : m)) }));

  const statuses: ProjectStatus[] = isEdit ? PROJECT_STATUSES : ['active', 'planning'];

  return (
    <Modal
      open={open}
      title={isEdit ? t('form.editTitle') : t('form.newTitle')}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('form.cancel')}
          </button>
          <button type="submit" form="project-form" className="btn-primary" disabled={saving}>
            {isEdit ? t('form.save') : t('form.create')}
          </button>
        </>
      }
    >
      <form id="project-form" onSubmit={submit} noValidate>
        {error && <div className="alert alert-error mb-3">{error}</div>}
        <div className="form-group">
          <label htmlFor="project-name">
            {t('form.name')}
            <RequiredMark />
          </label>
          <input
            id="project-name"
            value={form.name}
            maxLength={200}
            placeholder={t('form.namePlaceholder')}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
          />
        </div>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <div className="form-group min-w-0">
            <label htmlFor="project-company">{t('form.company')}</label>
            <select id="project-company" value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
              <option value="">{t('form.noCompany')}</option>
              {(options?.companies ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group min-w-0">
            <label htmlFor="project-owner">
              {t('form.owner')}
              <RequiredMark />
            </label>
            <select id="project-owner" value={form.ownerEmployeeId} onChange={(e) => setForm({ ...form, ownerEmployeeId: e.target.value })}>
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
            <label htmlFor="project-start">{t('form.startDate')}</label>
            <input id="project-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div className="form-group min-w-0">
            <label htmlFor="project-due">{t('form.dueDate')}</label>
            <input id="project-due" type="date" value={form.dueDate} min={form.startDate || undefined} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div className="form-group min-w-0">
            <label htmlFor="project-status">{t('form.status')}</label>
            <select id="project-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="project-description">{t('form.description')}</label>
          <textarea id="project-description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>

        {!isEdit && (
          <fieldset className="mt-2">
            <legend className="mb-1 text-sm font-medium">{t('form.team')}</legend>
            <p className="mb-2 text-xs text-ink-faint dark:text-dark-ink-faint">{t('form.teamHint')}</p>
            <div className="form-group m-0 flex flex-col gap-2">
              {form.members.map((m, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
                  <select id={`project-member-${i}`} aria-label={t('form.member')} value={m.employeeId} onChange={(e) => setMember(i, { employeeId: e.target.value })}>
                    <option value="">{t('form.choosePerson')}</option>
                    {employees
                      .filter((e) => e.id === m.employeeId || (e.id !== form.ownerEmployeeId && !form.members.some((x) => x.employeeId === e.id)))
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.firstName} {e.lastName}
                          {e.hasLogin ? '' : ` (${t('form.noLogin')})`}
                        </option>
                      ))}
                  </select>
                  <input
                    id={`project-member-role-${i}`}
                    aria-label={t('form.role')}
                    placeholder={t('form.rolePlaceholder')}
                    value={m.projectRole ?? ''}
                    maxLength={80}
                    onChange={(e) => setMember(i, { projectRole: e.target.value })}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('form.removeMember', { name: personLabel(m.employeeId) })}
                    onClick={() => setForm((f) => ({ ...f, members: f.members.filter((_, j) => j !== i) }))}
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn-secondary btn-sm self-start"
                onClick={() => setForm((f) => ({ ...f, members: [...f.members, { employeeId: '', projectRole: '' }] }))}
              >
                + {t('form.addMember')}
              </button>
            </div>
          </fieldset>
        )}
      </form>
    </Modal>
  );
}
