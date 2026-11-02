import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  api,
  ApiError,
  type FormAction,
  type FormDefinition,
  type FormInput,
  type FormKind,
  type FormModule,
  type FormQuestion,
  type FormsMeta,
  type QuestionType,
  type SurveySettings,
} from '../../api';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from '../../components/common/Icons';
import { useToast } from '../../components/common/ToastProvider';
import { FormsFrame, Loading, QuestionPreview, targetLabel, useFormsMeta } from './formsShared';

// Formularios y encuestas → editor (B5): module, action, questions with where each answer goes,
// and a live preview, as in the prototype. The share card (URL, embed code, domains) arrives with
// the public page (B3); personal-link sending with B4.

const MODULES: FormModule[] = ['leads', 'clients', 'employees', 'support', 'projects', 'none'];
const SURVEY_MODULES: FormModule[] = ['clients', 'employees', 'leads'];
const MODULE_ACTIONS: Record<FormModule, FormAction[]> = {
  leads: ['create_lead'],
  clients: ['update_contact', 'add_contact'],
  employees: ['update_employee', 'save_to_file'],
  support: ['create_ticket'],
  projects: ['create_task'],
  none: ['save_only'],
};
const CF_ENTITY: Partial<Record<FormAction, 'contact' | 'employee'>> = {
  create_lead: 'contact',
  update_contact: 'contact',
  add_contact: 'contact',
  update_employee: 'employee',
};
const FORM_TYPES: QuestionType[] = ['short_text', 'long_text', 'email', 'phone', 'number', 'date', 'select', 'multi_select', 'yes_no'];
const SURVEY_TYPES: QuestionType[] = ['rating_nps', 'rating_csat', 'long_text', 'select', 'yes_no'];
const TRIGGERS: Record<string, string[]> = {
  clients: ['manual', 'onboarding_done', 'ticket_closed', 'every_90_days'],
  employees: ['manual', 'quarterly', '30_days_after_hire', 'offboarding'],
  leads: ['manual', 'opportunity_lost'],
};
const PUBLIC_MODULES: FormModule[] = ['leads', 'support', 'projects', 'none'];

// Public forms (B3): the link, the embed code in its three styles, where it may be embedded and what
// happens after sending. The URL only answers once the form is published.
function ShareCard({
  draft,
  set,
  existing,
  tenantSlug,
}: {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  existing: FormDefinition | null;
  tenantSlug: string | null;
}) {
  const { t } = useTranslation('forms');
  const toast = useToast();
  const live = existing?.status === 'published' && !existing.legacy && tenantSlug;
  const url = live ? `${window.location.origin}/f/${tenantSlug}/${existing!.slug}` : '';
  const key = live ? `${tenantSlug}/${existing!.slug}` : '';
  const label = draft.buttonLabel.trim() || draft.name.trim() || t('editor.defaultButton');
  const code =
    `<script src="${window.location.origin}/f/embed.js" data-form="${key}"` +
    (draft.embedStyle === 'inline' ? '' : ` data-style="${draft.embedStyle}" data-label="${label.replace(/"/g, '&quot;')}"`) +
    ' async></script>';
  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(
      () => toast.success(t('editor.copied')),
      () => toast.error(t('editor.copyFailed')),
    );

  return (
    <section className="card ex-card">
      <h3 className="card-title m-0">{t('editor.shareTitle')}</h3>
      {!live ? (
        <p className="ex-muted m-0 text-sm">{t('editor.publishToShare')}</p>
      ) : (
        <>
          <div className="ex-field">
            {t('editor.publicUrl')}
            <div className="flex gap-2">
              <input readOnly value={url} className="min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.target.select()} />
              <button type="button" className="btn-secondary btn-sm" onClick={() => copy(url)}>
                {t('editor.copy')}
              </button>
            </div>
            <span className="ex-hint font-normal">{t('editor.publicUrlHint')}</span>
          </div>
          <div className="ex-field">
            {t('editor.embedStyle')}
            <div className="flex flex-wrap gap-1.5">
              {(['inline', 'button', 'popup'] as const).map((s) => (
                <button key={s} type="button" className={`ex-option ${draft.embedStyle === s ? 'active' : ''}`} onClick={() => set({ embedStyle: s })}>
                  {t(`embed.${s}`)}
                </button>
              ))}
            </div>
            <span className="ex-hint font-normal">{t(`embedHint.${draft.embedStyle}`)}</span>
          </div>
          {draft.embedStyle !== 'inline' && (
            <label className="ex-field">
              {t('editor.buttonLabel')}
              <input value={draft.buttonLabel} maxLength={40} placeholder={draft.name} onChange={(e) => set({ buttonLabel: e.target.value })} />
            </label>
          )}
          <div className="ex-raw">
            <code className="!whitespace-pre-wrap break-all">{code}</code>
          </div>
          <button type="button" className="btn-secondary btn-sm self-start" onClick={() => copy(code)}>
            {t('editor.copyCode')}
          </button>
        </>
      )}
      <label className="ex-field">
        {t('editor.domains')}
        <input value={draft.domains} placeholder="acme.com, www.acme.com" onChange={(e) => set({ domains: e.target.value })} />
        <span className="ex-hint font-normal">{t('editor.domainsHint')}</span>
      </label>
      <label className="ex-field">
        {t('editor.afterSubmit')}
        <select value={draft.afterMode} onChange={(e) => set({ afterMode: e.target.value as Draft['afterMode'] })}>
          <option value="message">{t('editor.afterMessage')}</option>
          <option value="redirect">{t('editor.afterRedirect')}</option>
        </select>
      </label>
      {draft.afterMode === 'message' ? (
        <label className="ex-field">
          {t('editor.thanksText')}
          <textarea rows={2} maxLength={1000} value={draft.afterMessage} placeholder={t('editor.thanksPlaceholder')} onChange={(e) => set({ afterMessage: e.target.value })} />
        </label>
      ) : (
        <label className="ex-field">
          {t('editor.redirectUrl')}
          <input type="url" value={draft.redirectUrl} placeholder="https://acme.com/gracias" onChange={(e) => set({ redirectUrl: e.target.value })} />
        </label>
      )}
      <span className="ex-hint">{t('editor.publicSafety')}</span>
    </section>
  );
}

const newId = () => `q${Math.random().toString(36).slice(2, 8)}`;

function actionsFor(kind: FormKind, module: FormModule): FormAction[] {
  if (kind === 'survey') return module === 'employees' ? ['save_to_file'] : ['save_only'];
  return MODULE_ACTIONS[module];
}

// A sensible start for each new form or survey, so it's valid from the first save.
function starterQuestions(kind: FormKind, module: FormModule, t: (k: string) => string): FormQuestion[] {
  if (kind === 'survey') {
    return [
      { id: newId(), label: t(module === 'employees' ? 'enps' : 'nps'), type: 'rating_nps', required: true, mapTo: null },
      { id: newId(), label: t('why'), type: 'long_text', required: false, mapTo: null },
    ];
  }
  if (module === 'leads') {
    return [
      { id: newId(), label: t('firstName'), type: 'short_text', required: true, mapTo: 'contact.firstName' },
      { id: newId(), label: t('email'), type: 'email', required: true, mapTo: 'contact.email' },
      { id: newId(), label: t('company'), type: 'short_text', required: false, mapTo: 'company.name' },
    ];
  }
  if (module === 'projects') return [{ id: newId(), label: t('taskTitle'), type: 'short_text', required: true, mapTo: 'task.title' }];
  if (module === 'support') return [{ id: newId(), label: t('subject'), type: 'short_text', required: true, mapTo: 'ticket.subject' }];
  return [{ id: newId(), label: t('question'), type: 'short_text', required: true, mapTo: null }];
}

type Draft = Required<Pick<FormInput, 'name' | 'kind' | 'module' | 'action' | 'fields'>> & {
  description: string;
  pipelineId: string | null;
  actionConfig: { projectId?: string; phaseId?: string; assigneeId?: string };
  surveySettings: SurveySettings;
  domains: string;
  afterMode: 'message' | 'redirect';
  afterMessage: string;
  redirectUrl: string;
  embedStyle: 'inline' | 'button' | 'popup';
  buttonLabel: string;
};

export default function FormEditorPage({ token }: { token: string }) {
  const { t } = useTranslation('forms');
  const { id } = useParams();
  const [params] = useSearchParams();
  const { meta, error } = useFormsMeta(token);
  const [existing, setExisting] = useState<FormDefinition | null | undefined>(id ? undefined : null);

  useEffect(() => {
    if (!id) return;
    api
      .getForm(token, id)
      .then(setExisting)
      .catch(() => setExisting(null));
  }, [token, id]);

  const kind: FormKind = existing?.kind ?? (params.get('kind') === 'survey' ? 'survey' : 'form');
  const title = existing ? existing.name : t(kind === 'survey' ? 'titles.newSurvey' : 'titles.newForm');

  return (
    <FormsFrame title={title}>
      {error ? (
        <p className="text-sm">{t('state.loadFailed', { error })}</p>
      ) : !meta || existing === undefined ? (
        <Loading />
      ) : (
        <Editor key={existing?.id ?? 'new'} token={token} meta={meta} existing={existing} kind={kind} onSaved={setExisting} />
      )}
    </FormsFrame>
  );
}

function Editor({
  token,
  meta,
  existing,
  kind,
  onSaved,
}: {
  token: string;
  meta: FormsMeta;
  existing: FormDefinition | null;
  kind: FormKind;
  onSaved: (f: FormDefinition) => void;
}) {
  const { t } = useTranslation('forms');
  const toast = useToast();
  const navigate = useNavigate();
  const st = (k: string) => t(`starterText.${k}`);
  const [draft, setDraft] = useState<Draft>(() => {
    const module: FormModule = existing?.module ?? (kind === 'survey' ? 'clients' : 'leads');
    return {
      name: existing?.name ?? '',
      description: existing?.description ?? '',
      kind,
      module,
      action: existing?.action ?? actionsFor(kind, module)[0],
      fields: existing && !existing.legacy ? existing.fields : starterQuestions(kind, module, st),
      pipelineId: existing?.pipelineId ?? null,
      actionConfig: existing?.actionConfig ?? {},
      surveySettings: existing?.surveySettings ?? { metric: 'nps', trigger: 'manual', anonymous: module === 'employees', countsTowardHealth: true },
      domains: (existing?.allowedDomains ?? []).join(', '),
      afterMode: existing?.afterSubmit?.mode ?? 'message',
      afterMessage: existing?.afterSubmit?.message ?? '',
      redirectUrl: existing?.afterSubmit?.redirectUrl ?? '',
      embedStyle: existing?.embedSettings?.style ?? 'inline',
      buttonLabel: existing?.embedSettings?.buttonLabel ?? '',
    };
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const status = existing?.status ?? 'draft';

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setModule = (module: FormModule) => {
    const action = actionsFor(kind, module)[0];
    // Questions are kept, but a mapping that doesn't exist in the new module is dropped.
    const allowed = new Set(meta.targets[action] ?? []);
    const cfEntity = CF_ENTITY[action];
    const fields = draft.fields.map((q) => ({
      ...q,
      mapTo: q.mapTo && (allowed.has(q.mapTo) || (q.mapTo.startsWith('cf:') && cfEntity && meta.customFields.some((c) => `cf:${c.id}` === q.mapTo && c.entityType === cfEntity))) ? q.mapTo : null,
    }));
    set({
      module,
      action,
      fields: existing || draft.fields.some((q) => q.label && !q.mapTo) ? fields : starterQuestions(kind, module, st),
      surveySettings: { ...draft.surveySettings, anonymous: module === 'employees', trigger: 'manual', metric: module === 'employees' ? 'enps' : draft.surveySettings.metric === 'enps' ? 'nps' : draft.surveySettings.metric },
    });
  };
  const setQuestion = (i: number, patch: Partial<FormQuestion>) =>
    set({ fields: draft.fields.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= draft.fields.length) return;
    const fields = [...draft.fields];
    [fields[i], fields[j]] = [fields[j], fields[i]];
    set({ fields });
  };
  const addQuestion = (type: QuestionType) =>
    set({
      fields: [
        ...draft.fields,
        { id: newId(), label: '', type, required: false, mapTo: null, ...(type === 'select' || type === 'multi_select' ? { options: [st('optionA'), st('optionB')] } : {}) },
      ],
    });

  const targets = useMemo(() => {
    const action = draft.action as FormAction;
    const cfEntity = CF_ENTITY[action];
    return [
      ...(kind === 'survey' ? [] : (meta.targets[action] ?? [])),
      ...(kind === 'survey' || !cfEntity ? [] : meta.customFields.filter((c) => c.entityType === cfEntity).map((c) => `cf:${c.id}`)),
    ];
  }, [draft.action, kind, meta]);

  const lands = (() => {
    if (kind === 'survey') return t(draft.surveySettings.anonymous ? 'lands.surveyAnonymous' : 'lands.survey');
    if (draft.action === 'create_lead') {
      const pipeline = meta.pipelines.find((p) => p.id === draft.pipelineId);
      return t('lands.create_lead', { pipeline: pipeline ? t('lands.pipelineSuffix', { name: pipeline.name }) : '' });
    }
    return t(`lands.${draft.action}`);
  })();

  const errorText = (e: unknown) => {
    const code = e instanceof ApiError ? (e.body as { code?: string } | undefined)?.code : undefined;
    if (code === 'missing_required_target') return t('error.missing_required_target', { targets: t(`requiredTargets.${draft.action}`) });
    return code && t(`error.${code}`, { defaultValue: '' }) ? t(`error.${code}`) : (e as Error).message;
  };

  const save = async (nextStatus?: 'draft' | 'published') => {
    setSaving(true);
    const body: FormInput = {
      name: draft.name,
      description: draft.description || null,
      kind,
      module: draft.module,
      action: draft.action,
      fields: draft.fields,
      pipelineId: draft.action === 'create_lead' ? draft.pipelineId : null,
      actionConfig: draft.action === 'create_task' ? draft.actionConfig : null,
      surveySettings: kind === 'survey' ? draft.surveySettings : null,
      allowedDomains: draft.domains.split(/[\s,]+/).filter(Boolean),
      afterSubmit:
        draft.afterMode === 'redirect' ? { mode: 'redirect', redirectUrl: draft.redirectUrl.trim() } : { mode: 'message', message: draft.afterMessage.trim() },
      embedSettings: { style: draft.embedStyle, buttonLabel: draft.buttonLabel.trim() },
      ...(nextStatus ? { status: nextStatus } : {}),
    };
    try {
      if (existing) {
        const saved = await api.updateForm(token, existing.id, body);
        onSaved(saved);
        toast.success(nextStatus === 'published' ? t('editor.published') : nextStatus === 'draft' ? t('editor.unpublished') : t('editor.saved'));
      } else {
        const saved = await api.createForm(token, body);
        toast.success(t('editor.created'));
        navigate(`/forms/${saved.id}`, { replace: true });
      }
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    try {
      await api.deleteForm(token, existing.id);
      toast.success(t('editor.deleted'));
      navigate('/forms');
    } catch (e) {
      toast.error(errorText(e));
      setDeleting(false);
    }
  };

  const isPersonal = kind === 'survey' || !PUBLIC_MODULES.includes(draft.module);
  const project = meta.projects.find((p) => p.id === draft.actionConfig.projectId);
  const modules = kind === 'survey' ? SURVEY_MODULES : MODULES;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <button type="button" className="btn-secondary btn-sm" onClick={() => navigate('/forms')}>
          {t('editor.back')}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`to-chip ${status === 'published' ? 'to-chip-approved' : 'to-chip-cancelled'}`}>{t(`status.${status}`)}</span>
          {existing && existing.responseCount === 0 && (
            <button type="button" className="btn-secondary" onClick={() => setDeleting(true)}>
              {t('editor.delete')}
            </button>
          )}
          <button type="button" className="btn-secondary" disabled={saving} onClick={() => save()}>
            {saving ? t('editor.saving') : t('editor.save')}
          </button>
          <button type="button" className="btn-primary" disabled={saving} onClick={() => save(status === 'published' ? 'draft' : 'published')}>
            {status === 'published' ? t('editor.unpublish') : t('editor.publish')}
          </button>
        </div>
      </div>

      {existing?.legacy && <div className="card sh-note-warn text-sm">{t('editor.legacyNotice')}</div>}

      <div className="fm-layout">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="card ex-card">
            <label className="ex-field">
              {t('editor.name')}
              <input value={draft.name} maxLength={120} placeholder={t('editor.namePlaceholder')} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <label className="ex-field">
              {t('editor.description')}
              <textarea rows={2} maxLength={1000} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
            </label>
            <div className="ex-field">
              {t('editor.module')}
              <div className="flex flex-wrap gap-1.5">
                {modules.map((m) => (
                  <button key={m} type="button" className={`ex-option ${draft.module === m ? 'active' : ''}`} onClick={() => setModule(m)}>
                    {t(`module.${m}`)}
                  </button>
                ))}
              </div>
              <span className="ex-hint font-normal">{t(`moduleHint.${draft.module}`)}</span>
            </div>

            {kind === 'form' && (
              <div className="ex-field">
                {t('editor.action')}
                <div className="flex flex-wrap gap-1.5">
                  {MODULE_ACTIONS[draft.module].map((a) => (
                    <button key={a} type="button" className={`ex-option ${draft.action === a ? 'active' : ''}`} onClick={() => set({ action: a })}>
                      {t(`action.${a}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {kind === 'form' && draft.action === 'create_lead' && (
              <label className="ex-field">
                {t('editor.pipeline')}
                <select value={draft.pipelineId ?? ''} onChange={(e) => set({ pipelineId: e.target.value || null })}>
                  <option value="">{t('editor.noPipeline')}</option>
                  {meta.pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {kind === 'form' && draft.action === 'create_task' && (
              <div className="ex-filters">
                <label className="ex-field grow">
                  {t('editor.project')}
                  <select value={draft.actionConfig.projectId ?? ''} onChange={(e) => set({ actionConfig: { ...draft.actionConfig, projectId: e.target.value, phaseId: undefined } })}>
                    <option value="">{t('editor.chooseProject')}</option>
                    {meta.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                {project && project.phases.length > 0 && (
                  <label className="ex-field">
                    {t('editor.phase')}
                    <select value={draft.actionConfig.phaseId ?? ''} onChange={(e) => set({ actionConfig: { ...draft.actionConfig, phaseId: e.target.value || undefined } })}>
                      <option value="">{t('editor.noPhase')}</option>
                      {project.phases.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="ex-field">
                  {t('editor.assignee')}
                  <select value={draft.actionConfig.assigneeId ?? ''} onChange={(e) => set({ actionConfig: { ...draft.actionConfig, assigneeId: e.target.value } })}>
                    <option value="">{t('editor.chooseAssignee')}</option>
                    {meta.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {kind === 'survey' && (
              <>
                <div className="ex-field">
                  {t('editor.metric')}
                  <div className="flex flex-wrap gap-1.5">
                    {(draft.module === 'employees' ? ['enps', 'none'] : ['nps', 'csat', 'none']).map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`ex-option ${draft.surveySettings.metric === m ? 'active' : ''}`}
                        onClick={() => set({ surveySettings: { ...draft.surveySettings, metric: m as SurveySettings['metric'] } })}
                      >
                        {t(`metric.${m}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ex-field">
                  {t('editor.trigger')}
                  <div className="flex flex-wrap gap-1.5">
                    {(TRIGGERS[draft.module] ?? ['manual']).map((tr) => (
                      <button
                        key={tr}
                        type="button"
                        className={`ex-option ${draft.surveySettings.trigger === tr ? 'active' : ''}`}
                        onClick={() => set({ surveySettings: { ...draft.surveySettings, trigger: tr } })}
                      >
                        {t(`trigger.${tr}`)}
                      </button>
                    ))}
                  </div>
                </div>
                {draft.module === 'clients' && (
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.surveySettings.countsTowardHealth !== false}
                      onChange={(e) => set({ surveySettings: { ...draft.surveySettings, countsTowardHealth: e.target.checked } })}
                    />
                    {t('editor.health')}
                  </label>
                )}
                {draft.module === 'employees' && (
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.surveySettings.anonymous !== false}
                      onChange={(e) => set({ surveySettings: { ...draft.surveySettings, anonymous: e.target.checked } })}
                    />
                    {t('editor.anonymous')}
                  </label>
                )}
              </>
            )}

            <div className="fm-lands">
              <strong>{t('editor.landsTitle')}</strong>
              <span>{lands}</span>
            </div>
          </section>

          <section className="card ex-card">
            <h3 className="card-title m-0">{kind === 'survey' ? t('editor.surveyQuestionsTitle') : t('editor.questionsTitle')}</h3>
            {draft.fields.map((q, i) => (
              <div key={q.id} className="fm-question">
                <div className="flex items-center gap-2">
                  <input
                    className="min-w-0 flex-1"
                    value={q.label}
                    maxLength={300}
                    placeholder={t('editor.untitled')}
                    aria-label={t('editor.untitled')}
                    onChange={(e) => setQuestion(i, { label: e.target.value })}
                  />
                  <button type="button" className="icon-btn" aria-label={t('editor.moveUp')} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUpIcon className="h-4 w-4" />
                  </button>
                  <button type="button" className="icon-btn" aria-label={t('editor.moveDown')} disabled={i === draft.fields.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDownIcon className="h-4 w-4" />
                  </button>
                  <button type="button" className="icon-btn" aria-label={t('editor.remove')} onClick={() => set({ fields: draft.fields.filter((_, j) => j !== i) })}>
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 text-sm">
                  <span className="role-chip chip-neutral">{t(`questionType.${q.type}`)}</span>
                  <label className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={q.required} onChange={(e) => setQuestion(i, { required: e.target.checked })} />
                    {t('editor.required')}
                  </label>
                  {targets.length > 0 && (
                    <>
                      <span className="ex-muted">{t('editor.goesTo')}</span>
                      <select className="ex-inline-select !max-w-64" value={q.mapTo ?? ''} onChange={(e) => setQuestion(i, { mapTo: e.target.value || null })}>
                        <option value="">{t('editor.notCopied')}</option>
                        {targets.map((target) => (
                          <option key={target} value={target} disabled={draft.fields.some((o) => o.id !== q.id && o.mapTo === target)}>
                            {targetLabel(t, target, meta)}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
                {(q.type === 'select' || q.type === 'multi_select') && (
                  <label className="ex-field">
                    {t('editor.options')}
                    <textarea
                      rows={3}
                      value={(q.options ?? []).join('\n')}
                      onChange={(e) => setQuestion(i, { options: e.target.value.split('\n') })}
                      onBlur={(e) => setQuestion(i, { options: e.target.value.split('\n').map((o) => o.trim()).filter(Boolean) })}
                    />
                  </label>
                )}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="ex-muted text-sm">{t('editor.add')}</span>
              {(kind === 'survey' ? SURVEY_TYPES : FORM_TYPES).map((type) => (
                <button key={type} type="button" className="btn-secondary btn-sm" onClick={() => addQuestion(type)}>
                  + {t(`questionType.${type}`)}
                </button>
              ))}
            </div>
          </section>

          {isPersonal ? (
            <section className="card ex-card">
              <h3 className="card-title m-0">{t('editor.personalTitle')}</h3>
              <p className="ex-muted m-0 text-sm">{t('editor.personalBody')}</p>
            </section>
          ) : (
            <ShareCard draft={draft} set={set} existing={existing} tenantSlug={meta.tenantSlug} />
          )}
        </div>

        <aside className="card fm-preview">
          <div className="flex items-center justify-between gap-2">
            <h3 className="card-title m-0">{t('editor.previewTitle')}</h3>
            <span className="ex-muted text-xs">{isPersonal ? t('editor.previewAsPersonal') : t('editor.previewAsPublic')}</span>
          </div>
          <div className="fm-preview-sheet">
            <strong className="text-base">{draft.name || t('editor.namePlaceholder')}</strong>
            {draft.description && <p className="ex-muted m-0 text-sm whitespace-pre-line">{draft.description}</p>}
            {draft.fields.length === 0 ? (
              <span className="ex-muted text-sm">{t('editor.previewEmpty')}</span>
            ) : (
              draft.fields.map((q) => <QuestionPreview key={q.id} question={q} />)
            )}
            <button type="button" className="btn-primary self-start" disabled>
              {t('editor.send')}
            </button>
          </div>
        </aside>
      </div>

      {deleting && existing && (
        <ConfirmDialog
          title={t('editor.deleteTitle', { name: existing.name })}
          message={t('editor.deleteBody')}
          confirmLabel={t('editor.delete')}
          danger
          onConfirm={remove}
          onCancel={() => setDeleting(false)}
        />
      )}
    </>
  );
}
