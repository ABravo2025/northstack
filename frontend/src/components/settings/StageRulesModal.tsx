import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type FormDefinition, type PipelineStage, type StageAutomation, type StageChecklistItem } from '../../api';
import Modal from '../common/Modal';
import { TrashIcon } from '../common/Icons';
import { useToast } from '../common/ToastProvider';
import { usePermissions } from '../../contexts/PermissionsContext';

// Clientes C1 (spec-clientes-gastos-formularios.md): one stage's optional rules — the checklist a
// deal must complete before moving forward out of it, and what happens when a deal enters it.
const newId = () => Math.random().toString(36).slice(2, 10);

export default function StageRulesModal({
  token,
  pipelineId,
  stage,
  onClose,
  onSaved,
}: {
  token: string;
  pipelineId: string;
  stage: PipelineStage;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation('settingsPages');
  const toast = useToast();
  const permissions = usePermissions();
  const [checklist, setChecklist] = useState<StageChecklistItem[]>(stage.exitChecklist ?? []);
  const [automations, setAutomations] = useState<StageAutomation[]>(stage.enterAutomations ?? []);
  const [surveys, setSurveys] = useState<FormDefinition[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!permissions.features.forms) return;
    api
      .listForms(token)
      .then((forms) => setSurveys(forms.filter((f) => f.kind === 'survey' && (f.module === 'clients' || f.module === 'leads') && f.status === 'published')))
      .catch(() => setSurveys([]));
  }, [token, permissions.features.forms]);

  const save = async () => {
    setSaving(true);
    try {
      await api.updatePipelineStage(token, pipelineId, stage.id, {
        exitChecklist: checklist.filter((i) => i.label.trim()),
        enterAutomations: automations.filter((a) => (a.type === 'create_task' ? a.title.trim() : a.formId)),
      });
      toast.success(t('pipelineRules.saved'));
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const setItem = (i: number, patch: Partial<StageChecklistItem>) => setChecklist(checklist.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const setAutomation = (i: number, next: StageAutomation) => setAutomations(automations.map((a, j) => (j === i ? next : a)));

  return (
    <Modal
      open
      wide
      title={t('pipelineRules.title', { stage: stage.name })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('pipelineRules.cancel')}
          </button>
          <button type="button" className="btn-primary" disabled={saving} onClick={save}>
            {saving ? t('pipelineRules.saving') : t('pipelineRules.save')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <h3 className="card-title m-0">{t('pipelineRules.checklistTitle')}</h3>
          <p className="m-0 text-sm text-ink-muted dark:text-dark-ink-muted">
            {stage.outcome === 'open' ? t('pipelineRules.checklistHelp') : t('pipelineRules.checklistClosedHelp')}
          </p>
          {checklist.map((item, i) => (
            <div key={item.id} className="flex items-center gap-2">
              <input
                className="min-w-0 flex-1"
                value={item.label}
                maxLength={200}
                placeholder={t('pipelineRules.itemPlaceholder')}
                aria-label={t('pipelineRules.itemPlaceholder')}
                onChange={(e) => setItem(i, { label: e.target.value })}
              />
              <label className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
                <input type="checkbox" checked={item.required} onChange={(e) => setItem(i, { required: e.target.checked })} />
                {t('pipelineRules.required')}
              </label>
              <button type="button" className="icon-btn" aria-label={t('pipelineRules.remove')} onClick={() => setChecklist(checklist.filter((_, j) => j !== i))}>
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
          {checklist.length < 15 && (
            <button type="button" className="btn-secondary btn-sm self-start" onClick={() => setChecklist([...checklist, { id: newId(), label: '', required: true }])}>
              + {t('pipelineRules.addItem')}
            </button>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="card-title m-0">{t('pipelineRules.automationsTitle')}</h3>
          <p className="m-0 text-sm text-ink-muted dark:text-dark-ink-muted">{t('pipelineRules.automationsHelp')}</p>
          {automations.map((a, i) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2.5 dark:border-dark-line">
              {a.type === 'create_task' ? (
                <>
                  <span className="text-sm font-medium">{t('pipelineRules.createTask')}</span>
                  <input
                    className="min-w-40 flex-1"
                    value={a.title}
                    maxLength={200}
                    placeholder={t('pipelineRules.taskPlaceholder')}
                    aria-label={t('pipelineRules.taskPlaceholder')}
                    onChange={(e) => setAutomation(i, { ...a, title: e.target.value })}
                  />
                  <label className="inline-flex items-center gap-1.5 text-sm">
                    {t('pipelineRules.dueIn')}
                    <input
                      type="number"
                      min={0}
                      max={365}
                      className="w-16"
                      value={a.dueInDays}
                      onChange={(e) => setAutomation(i, { ...a, dueInDays: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })}
                    />
                    {t('pipelineRules.days')}
                  </label>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium">{t('pipelineRules.sendSurvey')}</span>
                  <select className="min-w-40 flex-1" value={a.formId} onChange={(e) => setAutomation(i, { ...a, formId: e.target.value })} aria-label={t('pipelineRules.sendSurvey')}>
                    <option value="">{t('pipelineRules.chooseSurvey')}</option>
                    {surveys.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <button type="button" className="icon-btn" aria-label={t('pipelineRules.remove')} onClick={() => setAutomations(automations.filter((_, j) => j !== i))}>
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
          {automations.length < 5 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setAutomations([...automations, { id: newId(), type: 'create_task', title: '', dueInDays: 1 }])}
              >
                + {t('pipelineRules.addTask')}
              </button>
              {surveys.length > 0 && (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setAutomations([...automations, { id: newId(), type: 'send_survey', formId: surveys[0].id }])}
                >
                  + {t('pipelineRules.addSurvey')}
                </button>
              )}
            </div>
          )}
          <p className="m-0 text-xs text-ink-faint dark:text-dark-ink-faint">{t('pipelineRules.taskOwnerNote')}</p>
        </section>
      </div>
    </Modal>
  );
}
