import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Pipeline, type Form, type PublicFormFieldConfig } from '../api';
import { useToast } from '../components/common/ToastProvider';
import SlideOver from '../components/common/SlideOver';
import EmptyState from '../components/common/EmptyState';
import RequiredMark from '../components/common/RequiredMark';
import HorizontalScrollbar from '../components/entity-views/HorizontalScrollbar';
import { GripIcon, ListIcon, PlusIcon, XIcon } from '../components/common/Icons';
import { usePrimaryAction } from '../contexts/PrimaryActionContext';

interface PublicFormsSettingsPageProps {
  token: string;
}

type EntityTab = 'employee' | 'client' | 'contact';

const END_DROP_ZONE = '__end__';
const PALETTE_DROP_ZONE = '__palette__';

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function PublicFormsSettingsPage({ token }: PublicFormsSettingsPageProps) {
  const toast = useToast();
  const { t } = useTranslation('settingsPages');
  const [tab, setTab] = useState<EntityTab>('employee');
  const [forms, setForms] = useState<Form[]>([]);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const viewsBarRef = useRef<HTMLDivElement>(null);

  const [employeeCustomFields, setEmployeeCustomFields] = useState<any[]>([]);
  const [clientCustomFields, setClientCustomFields] = useState<any[]>([]);
  const [contactCustomFields, setContactCustomFields] = useState<any[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);

  const [slideOverMode, setSlideOverMode] = useState<'add' | 'edit' | null>(null);
  const [editingFormId, setEditingFormId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [thankYouMessage, setThankYouMessage] = useState('');
  const [pipelineId, setPipelineId] = useState<string>('');
  const [fieldOrder, setFieldOrder] = useState<string[]>([]);
  const [includedKeys, setIncludedKeys] = useState<Record<string, boolean>>({});
  const [requiredFields, setRequiredFields] = useState<Record<string, boolean>>({});
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadForms();
    loadCustomFields();
    loadPipelines();
  }, []);

  const loadForms = async () => {
    setLoading(true);
    try {
      const { tenantSlug: slug, forms: data } = await api.listPublicForms(token);
      setTenantSlug(slug);
      setForms(data);
    } catch (error) {
      toast.error(t('publicForms.loadError', { message: (error as Error).message }));
    } finally {
      setLoading(false);
    }
  };

  const loadCustomFields = async () => {
    try {
      const [employeeFields, clientFields, contactFields] = await Promise.all([
        api.listCustomFieldDefinitions(token, 'employee'),
        api.listCustomFieldDefinitions(token, 'client'),
        api.listCustomFieldDefinitions(token, 'contact'),
      ]);
      setEmployeeCustomFields(employeeFields.filter((f) => f.isActive));
      setClientCustomFields(clientFields.filter((f) => f.isActive));
      setContactCustomFields(contactFields.filter((f) => f.isActive));
    } catch (error) {
      toast.error(t('publicForms.loadCustomFieldsError', { message: (error as Error).message }));
    }
  };

  const loadPipelines = async () => {
    try {
      const data = await api.listPipelines(token);
      setPipelines(data.filter((p) => p.isActive));
    } catch (error) {
      toast.error(t('publicForms.loadPipelinesError', { message: (error as Error).message }));
    }
  };

  const filteredForms = forms.filter((f) => f.entityType === tab);

  const allFields = useMemo(() => {
    // Contact forms don't have a hardcoded first field: unlike Department (Employee)
    // or the free-text Company (Client), Company matching for a Contact is derived
    // automatically from the submitted email domain, not entered by the applicant.
    if (tab === 'contact') {
      return contactCustomFields.map((f) => ({ key: `cf:${f.id}`, label: f.name, fieldType: f.fieldType, options: f.options }));
    }
    const customFields = tab === 'employee' ? employeeCustomFields : clientCustomFields;
    return [
      {
        key: tab === 'employee' ? 'department' : 'company',
        label: tab === 'employee' ? t('publicForms.fields.department') : t('publicForms.fields.company'),
        fieldType: 'text',
        options: null as string | null,
      },
      ...customFields.map((f) => ({ key: `cf:${f.id}`, label: f.name, fieldType: f.fieldType, options: f.options })),
    ];
  }, [tab, employeeCustomFields, clientCustomFields, contactCustomFields, t]);

  // Custom field definitions load asynchronously and may still be in flight when the
  // SlideOver opens (e.g. clicking "New Form" right after the page loads). Keep fieldOrder
  // in sync so any field that shows up later still appears, instead of being silently missed.
  useEffect(() => {
    if (slideOverMode === null) return;
    setFieldOrder((prev) => {
      const missing = allFields.map((f) => f.key).filter((key) => !prev.includes(key));
      return missing.length === 0 ? prev : [...prev, ...missing];
    });
  }, [allFields, slideOverMode]);

  const handleOpenCreate = () => {
    setEditingFormId(null);
    setFormName('');
    setFormSlug('');
    setSlugTouched(false);
    setThankYouMessage('');
    setFieldOrder(allFields.map((f) => f.key));
    setIncludedKeys({});
    setRequiredFields({});
    setPipelineId('');
    setSlideOverMode('add');
  };

  usePrimaryAction({ label: t('publicForms.newForm'), onClick: handleOpenCreate });

  const handleOpenEdit = (form: Form) => {
    const fields: PublicFormFieldConfig[] = JSON.parse(form.fieldsConfig);
    const savedKeys = fields.map((f) => f.key);
    const remainingKeys = allFields.map((f) => f.key).filter((key) => !savedKeys.includes(key));
    setEditingFormId(form.id);
    setFormName(form.name);
    setFormSlug(form.slug);
    setSlugTouched(true);
    setThankYouMessage(form.thankYouMessage ?? '');
    setFieldOrder([...savedKeys, ...remainingKeys]);
    setIncludedKeys(Object.fromEntries(savedKeys.map((key) => [key, true])));
    setRequiredFields(Object.fromEntries(fields.map((f) => [f.key, f.required])));
    setPipelineId(form.pipelineId ?? '');
    setSlideOverMode('edit');
  };

  const handleNameChange = (value: string) => {
    setFormName(value);
    if (!slugTouched) {
      setFormSlug(slugify(value));
    }
  };

  const toggleFieldRequired = (key: string) => {
    setRequiredFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const removeField = (key: string) => {
    setIncludedKeys((prev) => ({ ...prev, [key]: false }));
  };

  const handleDragStart = (key: string) => setDraggedKey(key);
  const handleDragEnd = () => {
    setDraggedKey(null);
    setDragOverKey(null);
  };
  const handleDragOver = (e: React.DragEvent, overKey: string) => {
    e.preventDefault();
    if (dragOverKey !== overKey) setDragOverKey(overKey);
  };

  // Dropping onto a row in the preview inserts the dragged field just before that row
  // (or at the end, when targetKey is null — the trailing drop zone).
  const handleDropOnPreview = (targetKey: string | null) => {
    if (!draggedKey) return;
    setIncludedKeys((prev) => ({ ...prev, [draggedKey]: true }));
    setFieldOrder((prev) => {
      const next = prev.filter((k) => k !== draggedKey);
      if (targetKey === null || !next.includes(targetKey)) {
        next.push(draggedKey);
      } else {
        next.splice(next.indexOf(targetKey), 0, draggedKey);
      }
      return next;
    });
    setDraggedKey(null);
    setDragOverKey(null);
  };

  // Dropping back onto the available-fields palette removes the field from the form.
  const handleDropOnPalette = () => {
    if (!draggedKey) return;
    removeField(draggedKey);
    setDraggedKey(null);
    setDragOverKey(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fields: PublicFormFieldConfig[] = fieldOrder
        .filter((key) => includedKeys[key])
        .map((key) => ({ key, required: Boolean(requiredFields[key]) }));

      if (slideOverMode === 'edit' && editingFormId) {
        await api.updatePublicForm(token, editingFormId, {
          name: formName.trim(),
          fields,
          thankYouMessage,
          ...(tab === 'contact' ? { pipelineId: pipelineId || null } : {}),
        });
        toast.success(t('publicForms.formUpdated'));
      } else {
        await api.createPublicForm(token, {
          name: formName.trim(),
          slug: formSlug.trim(),
          entityType: tab,
          fields,
          thankYouMessage,
          ...(tab === 'contact' ? { pipelineId: pipelineId || null } : {}),
        });
        toast.success(t('publicForms.formCreated'));
      }
      setSlideOverMode(null);
      loadForms();
    } catch (error) {
      toast.error(t('publicForms.saveError', { message: (error as Error).message }));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (form: Form) => {
    try {
      await api.updatePublicForm(token, form.id, { isActive: !form.isActive });
      loadForms();
    } catch (error) {
      toast.error(t('publicForms.updateError', { message: (error as Error).message }));
    }
  };

  const handleCopyLink = (form: Form) => {
    const url = `${window.location.origin}/apply/${tenantSlug}/${form.slug}`;
    navigator.clipboard.writeText(url);
    toast.success(t('publicForms.linkCopied'));
  };

  const availableFields = allFields.filter((f) => !includedKeys[f.key]);
  const includedFields = fieldOrder
    .filter((key) => includedKeys[key])
    .map((key) => allFields.find((f) => f.key === key))
    .filter((f): f is (typeof allFields)[number] => Boolean(f));

  const renderPreviewInput = (field: (typeof allFields)[number]) => {
    if (field.fieldType === 'select') {
      return (
        <select disabled className="bg-surface-2 dark:bg-dark-raised">
          <option>-- select --</option>
          {(JSON.parse(field.options || '[]') as string[]).map((opt) => (
            <option key={opt}>{opt}</option>
          ))}
        </select>
      );
    }
    const inputType =
      field.fieldType === 'number' ? 'number' : field.fieldType === 'date' ? 'date' : field.fieldType === 'email' ? 'email' : 'text';
    return <input disabled type={inputType} className="bg-surface-2 dark:bg-dark-raised" />;
  };

  return (
    <div>
      <SlideOver
        open={slideOverMode !== null}
        side="left"
        wide
        title={slideOverMode === 'edit' ? t('publicForms.editTitle') : t('publicForms.newTitle')}
        onClose={() => setSlideOverMode(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setSlideOverMode(null)}>
              {t('publicForms.cancel')}
            </button>
            <button type="submit" form="public-form-form" className="btn-primary" disabled={saving}>
              {saving ? t('publicForms.saving') : slideOverMode === 'edit' ? t('publicForms.save') : t('publicForms.create')}
            </button>
          </>
        }
      >
        <form id="public-form-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="pf-name">
              {t('publicForms.name')}
              <RequiredMark />
            </label>
            <input
              id="pf-name"
              type="text"
              value={formName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={t('publicForms.namePlaceholder')}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="pf-slug">
              {t('publicForms.linkSlug')}
              <RequiredMark />
            </label>
            <input
              id="pf-slug"
              type="text"
              value={formSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setFormSlug(slugify(e.target.value));
              }}
              disabled={slideOverMode === 'edit'}
              required
            />
            {slideOverMode === 'edit' ? (
              <p className="mt-1 text-xs text-ink-muted dark:text-dark-ink-muted">{t('publicForms.slugImmutable')}</p>
            ) : (
              tenantSlug &&
              formSlug && (
                <p className="mt-1 text-xs text-ink-muted dark:text-dark-ink-muted">
                  {window.location.origin}/apply/{tenantSlug}/{formSlug}
                </p>
              )
            )}
          </div>

          {tab === 'contact' && (
            <div className="form-group">
              <label htmlFor="pf-pipeline">{t('publicForms.salesPipeline')}</label>
              <select id="pf-pipeline" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                <option value="">{t('publicForms.noPipeline')}</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-muted dark:text-dark-ink-muted">
                {t('publicForms.pipelineHelp')}
              </p>
            </div>
          )}

          <div className="form-group">
            <span>{t('publicForms.fieldsLabel')}</span>
            <p className="mb-2 text-xs text-ink-muted dark:text-dark-ink-muted">
              {t('publicForms.dragHelp')}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div
                onDragOver={(e) => handleDragOver(e, PALETTE_DROP_ZONE)}
                onDrop={handleDropOnPalette}
                className={`min-h-[120px] rounded border border-dashed p-2 transition-colors ${
                  dragOverKey === PALETTE_DROP_ZONE
                    ? 'border-brand-blue bg-brand-blue/5'
                    : 'border-line-strong dark:border-dark-line'
                }`}
              >
                <p className="mb-2 text-xs font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">
                  {t('publicForms.availableFields')}
                </p>
                {availableFields.length === 0 ? (
                  <p className="text-xs text-ink-muted dark:text-dark-ink-muted">{t('publicForms.allFieldsAdded')}</p>
                ) : (
                  availableFields.map((field) => (
                    <div
                      key={field.key}
                      draggable
                      onDragStart={() => handleDragStart(field.key)}
                      onDragEnd={handleDragEnd}
                      className={`mb-1.5 flex cursor-move items-center gap-2 rounded border border-line px-2 py-1.5 dark:border-dark-line ${draggedKey === field.key ? 'opacity-50' : ''}`}
                    >
                      <GripIcon className="h-3.5 w-3.5 shrink-0 text-ink-faint dark:text-dark-ink-faint" />
                      <span className="text-sm">{field.label}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="rounded border border-line p-3 dark:border-dark-line">
                <p className="mb-2 text-xs font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">
                  {t('publicForms.formPreview')}
                </p>
                <div className="mb-3">
                  <label className="mb-1 block text-sm font-medium">
                    {t('publicForms.firstName')}
                    <RequiredMark />
                  </label>
                  <input disabled className="bg-surface-2 dark:bg-dark-raised" />
                </div>
                <div className="mb-3">
                  <label className="mb-1 block text-sm font-medium">
                    {t('publicForms.lastName')}
                    <RequiredMark />
                  </label>
                  <input disabled className="bg-surface-2 dark:bg-dark-raised" />
                </div>
                <div className="mb-3">
                  <label className="mb-1 block text-sm font-medium">
                    {t('publicForms.email')}
                    <RequiredMark />
                  </label>
                  <input disabled className="bg-surface-2 dark:bg-dark-raised" />
                </div>

                {includedFields.map((field) => (
                  <div key={field.key}>
                    {draggedKey && draggedKey !== field.key && dragOverKey === field.key && (
                      <div className="mb-2 h-0.5 rounded-full bg-brand-blue" />
                    )}
                    <div
                      draggable
                      onDragStart={() => handleDragStart(field.key)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleDragOver(e, field.key)}
                      onDrop={(e) => {
                        e.stopPropagation();
                        handleDropOnPreview(field.key);
                      }}
                      className={`mb-3 cursor-move rounded border border-line p-2 dark:border-dark-line ${draggedKey === field.key ? 'opacity-50' : ''}`}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <GripIcon className="h-3.5 w-3.5 shrink-0 text-ink-faint dark:text-dark-ink-faint" />
                        <label className="flex-1 text-sm font-medium">
                          {field.label}
                          {requiredFields[field.key] && <RequiredMark />}
                        </label>
                        <label className="inline-flex items-center gap-1 text-xs font-normal text-ink-muted dark:text-dark-ink-muted">
                          <input
                            type="checkbox"
                            className="w-auto"
                            checked={Boolean(requiredFields[field.key])}
                            onChange={() => toggleFieldRequired(field.key)}
                          />
                          {t('publicForms.required')}
                        </label>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => removeField(field.key)}
                          aria-label={t('publicForms.removeFieldAria', { field: field.label })}
                          title={t('publicForms.remove')}
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {renderPreviewInput(field)}
                    </div>
                  </div>
                ))}

                {draggedKey && dragOverKey === END_DROP_ZONE && <div className="mb-2 h-0.5 rounded-full bg-brand-blue" />}
                <div
                  onDragOver={(e) => handleDragOver(e, END_DROP_ZONE)}
                  onDrop={() => handleDropOnPreview(null)}
                  className={`rounded border border-dashed py-3 text-center text-xs transition-colors ${
                    dragOverKey === END_DROP_ZONE
                      ? 'border-brand-blue text-brand-blue'
                      : 'border-line-strong text-ink-faint dark:border-dark-line dark:text-dark-ink-faint'
                  }`}
                >
                  {t('publicForms.dropToEnd')}
                </div>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="pf-thank-you">{t('publicForms.thankYouMessage')}</label>
            <textarea
              id="pf-thank-you"
              rows={3}
              value={thankYouMessage}
              onChange={(e) => setThankYouMessage(e.target.value)}
              placeholder={t('publicForms.thankYouPlaceholder')}
            />
            <p className="mt-1 text-xs text-ink-muted dark:text-dark-ink-muted">{t('publicForms.thankYouHelp')}</p>
          </div>
        </form>
      </SlideOver>

      <div className="page-toolbar no-border">
        <h2>{t('publicForms.title')}</h2>
        {/* Hidden below md: the mobile FAB (usePrimaryAction below) already exposes this same
            "New Form" action there. Hidden entirely once the current tab has no forms: the
            EmptyState below has its own "Build a form" button then. Either way it'd be two ways
            to do one thing. `hidden` goes on this wrapper, not the button — .btn-outline is
            unlayered custom CSS (App.css) that also sets `display`, which beats the `hidden`
            utility on the same element (Tailwind's utilities layer loses to unlayered CSS
            either way). */}
        {filteredForms.length > 0 && (
          <span className="hidden ml-auto md:inline-block">
            <button type="button" className="btn-outline gap-1.5" onClick={handleOpenCreate}>
              <PlusIcon className="h-3.5 w-3.5" />
              {t('publicForms.newForm')}
            </button>
          </span>
        )}
      </div>
      <div className="views-bar" ref={viewsBarRef}>
        <button type="button" className={`view-tab ${tab === 'employee' ? 'active' : ''}`} onClick={() => setTab('employee')}>
          {t('publicForms.tabs.employees')}
        </button>
        <button type="button" className={`view-tab ${tab === 'client' ? 'active' : ''}`} onClick={() => setTab('client')}>
          {t('publicForms.tabs.clients')}
        </button>
        <button type="button" className={`view-tab ${tab === 'contact' ? 'active' : ''}`} onClick={() => setTab('contact')}>
          {t('publicForms.tabs.contacts')}
        </button>
      </div>
      <HorizontalScrollbar targetRef={viewsBarRef} />

      <div className="mt-4">
        {loading && <p>{t('publicForms.loading')}</p>}
        {!loading && filteredForms.length === 0 && (
          <EmptyState
            icon={<ListIcon />}
            title={t('publicForms.emptyTitle')}
            body={t('publicForms.emptyBody')}
            primaryLabel={t('publicForms.buildForm')}
            onPrimary={handleOpenCreate}
          />
        )}
        {!loading && filteredForms.length > 0 && (
          <>
          <div className="entity-card-list">
            {filteredForms.map((form) => (
              <div
                key={form.id}
                className={`entity-card ${!form.isActive ? 'opacity-60' : ''}`}
                style={{ alignItems: 'flex-start' }}
              >
                <span className="entity-card-body">
                  <span className="entity-card-name">{form.name}</span>
                  <span className="entity-card-meta">{form.isActive ? t('publicForms.active') : t('publicForms.inactive')}</span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => handleCopyLink(form)}>
                      {t('publicForms.copyLink')}
                    </button>
                    <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => handleOpenEdit(form)}>
                      {t('publicForms.edit')}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary px-2 py-1 text-xs"
                      onClick={() => handleToggleActive(form)}
                    >
                      {form.isActive ? t('publicForms.deactivate') : t('publicForms.activate')}
                    </button>
                  </div>
                </span>
              </div>
            ))}
          </div>
          <div className="full-table-wrap has-mobile-cards">
            <table className="table full-table">
              <thead>
                <tr>
                  <th>{t('publicForms.columns.name')}</th>
                  <th>{t('publicForms.columns.link')}</th>
                  <th>{t('publicForms.columns.status')}</th>
                  <th>{t('publicForms.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredForms.map((form) => (
                  <tr key={form.id} className={!form.isActive ? 'table-row-inactive' : ''}>
                    <td>{form.name}</td>
                    <td>
                      <button type="button" className="table-link" onClick={() => handleCopyLink(form)}>
                        {t('publicForms.copyLink')}
                      </button>
                    </td>
                    <td>{form.isActive ? t('publicForms.active') : t('publicForms.inactive')}</td>
                    <td className="flex gap-1.5">
                      <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => handleOpenEdit(form)}>
                        {t('publicForms.edit')}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary px-2 py-1 text-xs"
                        onClick={() => handleToggleActive(form)}
                      >
                        {form.isActive ? t('publicForms.deactivate') : t('publicForms.activate')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
