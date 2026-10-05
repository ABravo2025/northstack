import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../common/Modal';
import RequiredMark from '../common/RequiredMark';
import { useToast } from '../common/ToastProvider';
import { usePermissions } from '../../contexts/PermissionsContext';
import { projectsApi, type ProjectDetail } from '../../api/projects';

interface SaveAsTemplateModalProps {
  open: boolean;
  token: string;
  project: ProjectDetail;
  taskCount: number;
  onClose: () => void;
  onSaved: () => void;
}

// Projects module, unit 5 — "Save as template" (Growth). The backend turns due dates into days
// from the start and each assignee into their role on the team (projectTemplateService.ts's
// saveProjectAsTemplate); on Starter this only explains the upgrade instead of offering a form.
export default function SaveAsTemplateModal({ open, token, project, taskCount, onClose, onSaved }: SaveAsTemplateModalProps) {
  const { t, i18n } = useTranslation('projects');
  const toast = useToast();
  const allowed = usePermissions().features.projectTemplates ?? true;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(project.template?.name ?? project.name);
    setDescription(project.description ?? '');
    setError(null);
  }, [open, project]);

  if (!allowed) {
    return (
      <Modal
        open={open}
        title={t('saveTemplate.title')}
        onClose={onClose}
        footer={
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('saveTemplate.close')}
          </button>
        }
      >
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <div className="font-semibold">{t('saveTemplate.upsellTitle')}</div>
          <div>{t('saveTemplate.upsellBody')}</div>
        </div>
      </Modal>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t('form.nameRequired'));
    setSaving(true);
    try {
      await projectsApi.saveProjectAsTemplate(token, project.id, {
        name: name.trim(),
        description: description.trim() || null,
        locale: i18n.language === 'es' ? 'es' : 'en',
      });
      toast.success(t('saveTemplate.saved'));
      onSaved();
    } catch (err) {
      setError(t('saveTemplate.error', { message: (err as Error).message }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('saveTemplate.title')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('form.cancel')}
          </button>
          <button type="submit" form="save-as-template" className="btn-primary" disabled={saving}>
            {t('saveTemplate.save')}
          </button>
        </>
      }
    >
      <form id="save-as-template" onSubmit={submit} noValidate>
        {error && <div className="alert alert-error mb-3">{error}</div>}
        <div className="form-group">
          <label htmlFor="template-name">
            {t('saveTemplate.name')}
            <RequiredMark />
          </label>
          <input id="template-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="form-group">
          <label htmlFor="template-description">{t('saveTemplate.description')}</label>
          <textarea id="template-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <p className="text-sm text-ink-muted dark:text-dark-ink-muted">
          {t('saveTemplate.summary', { phases: project.phases.length, tasks: taskCount })}
        </p>
      </form>
    </Modal>
  );
}
