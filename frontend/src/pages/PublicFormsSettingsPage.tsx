import { useEffect, useMemo, useState } from 'react';
import { api, type PublicForm, type PublicFormFieldConfig } from '../api';
import { useToast } from '../components/ToastProvider';
import SlideOver from '../components/SlideOver';
import { GripIcon, PlusIcon, XIcon } from '../components/Icons';

interface PublicFormsSettingsPageProps {
  token: string;
}

type EntityTab = 'employee' | 'client';

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
  const [tab, setTab] = useState<EntityTab>('employee');
  const [forms, setForms] = useState<PublicForm[]>([]);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [employeeCustomFields, setEmployeeCustomFields] = useState<any[]>([]);
  const [clientCustomFields, setClientCustomFields] = useState<any[]>([]);

  const [slideOverMode, setSlideOverMode] = useState<'add' | 'edit' | null>(null);
  const [editingFormId, setEditingFormId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [thankYouMessage, setThankYouMessage] = useState('');
  const [fieldOrder, setFieldOrder] = useState<string[]>([]);
  const [includedKeys, setIncludedKeys] = useState<Record<string, boolean>>({});
  const [requiredFields, setRequiredFields] = useState<Record<string, boolean>>({});
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadForms();
    loadCustomFields();
  }, []);

  const loadForms = async () => {
    setLoading(true);
    try {
      const { tenantSlug: slug, forms: data } = await api.listPublicForms(token);
      setTenantSlug(slug);
      setForms(data);
    } catch (error) {
      toast.error('Failed to load public forms: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomFields = async () => {
    try {
      const [employeeFields, clientFields] = await Promise.all([
        api.listCustomFieldDefinitions(token, 'employee'),
        api.listCustomFieldDefinitions(token, 'client'),
      ]);
      setEmployeeCustomFields(employeeFields.filter((f) => f.isActive));
      setClientCustomFields(clientFields.filter((f) => f.isActive));
    } catch (error) {
      toast.error('Failed to load custom fields: ' + (error as Error).message);
    }
  };

  const filteredForms = forms.filter((f) => f.entityType === tab);

  const allFields = useMemo(() => {
    const customFields = tab === 'employee' ? employeeCustomFields : clientCustomFields;
    return [
      {
        key: tab === 'employee' ? 'department' : 'company',
        label: tab === 'employee' ? 'Department' : 'Company',
        fieldType: 'text',
        options: null as string | null,
      },
      ...customFields.map((f) => ({ key: `cf:${f.id}`, label: f.name, fieldType: f.fieldType, options: f.options })),
    ];
  }, [tab, employeeCustomFields, clientCustomFields]);

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
    setSlideOverMode('add');
  };

  const handleOpenEdit = (form: PublicForm) => {
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
        });
        toast.success('Form updated.');
      } else {
        await api.createPublicForm(token, {
          name: formName.trim(),
          slug: formSlug.trim(),
          entityType: tab,
          fields,
          thankYouMessage,
        });
        toast.success('Form created.');
      }
      setSlideOverMode(null);
      loadForms();
    } catch (error) {
      toast.error('Failed to save form: ' + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (form: PublicForm) => {
    try {
      await api.updatePublicForm(token, form.id, { isActive: !form.isActive });
      loadForms();
    } catch (error) {
      toast.error('Failed to update form: ' + (error as Error).message);
    }
  };

  const handleCopyLink = (form: PublicForm) => {
    const url = `${window.location.origin}/apply/${tenantSlug}/${form.slug}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard.');
  };

  const availableFields = allFields.filter((f) => !includedKeys[f.key]);
  const includedFields = fieldOrder
    .filter((key) => includedKeys[key])
    .map((key) => allFields.find((f) => f.key === key))
    .filter((f): f is (typeof allFields)[number] => Boolean(f));

  const renderPreviewInput = (field: (typeof allFields)[number]) => {
    if (field.fieldType === 'select') {
      return (
        <select disabled className="bg-gray-50 dark:bg-gray-800">
          <option>-- select --</option>
          {(JSON.parse(field.options || '[]') as string[]).map((opt) => (
            <option key={opt}>{opt}</option>
          ))}
        </select>
      );
    }
    const inputType =
      field.fieldType === 'number' ? 'number' : field.fieldType === 'date' ? 'date' : field.fieldType === 'email' ? 'email' : 'text';
    return <input disabled type={inputType} className="bg-gray-50 dark:bg-gray-800" />;
  };

  return (
    <div>
      <SlideOver
        open={slideOverMode !== null}
        side="left"
        wide
        title={slideOverMode === 'edit' ? 'Edit Public Form' : 'New Public Form'}
        onClose={() => setSlideOverMode(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setSlideOverMode(null)}>
              Cancel
            </button>
            <button type="submit" form="public-form-form" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : slideOverMode === 'edit' ? 'Save' : 'Create'}
            </button>
          </>
        }
      >
        <form id="public-form-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="pf-name">Name</label>
            <input
              id="pf-name"
              type="text"
              value={formName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Job Application, Contact Us"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="pf-slug">Link slug</label>
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
              <p className="mt-1 text-xs text-gray-500">The link slug can't be changed once a form is created.</p>
            ) : (
              tenantSlug &&
              formSlug && (
                <p className="mt-1 text-xs text-gray-500">
                  {window.location.origin}/apply/{tenantSlug}/{formSlug}
                </p>
              )
            )}
          </div>

          <div className="form-group">
            <span>Fields</span>
            <p className="mb-2 text-xs text-gray-500">
              Drag a field from the left into the preview on the right, at the position you want it to appear.
              Drag a field already in the preview to reorder it, or back to the left to remove it.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div
                onDragOver={(e) => handleDragOver(e, PALETTE_DROP_ZONE)}
                onDrop={handleDropOnPalette}
                className={`min-h-[120px] rounded border border-dashed p-2 transition-colors ${
                  dragOverKey === PALETTE_DROP_ZONE
                    ? 'border-brand-blue bg-brand-blue/5'
                    : 'border-gray-300 dark:border-gray-700'
                }`}
              >
                <p className="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase dark:text-gray-500">
                  Available fields
                </p>
                {availableFields.length === 0 ? (
                  <p className="text-xs text-gray-500">All fields have been added to the form.</p>
                ) : (
                  availableFields.map((field) => (
                    <div
                      key={field.key}
                      draggable
                      onDragStart={() => handleDragStart(field.key)}
                      onDragEnd={handleDragEnd}
                      className={`mb-1.5 flex cursor-move items-center gap-2 rounded border border-gray-200 px-2 py-1.5 dark:border-gray-700 ${draggedKey === field.key ? 'opacity-50' : ''}`}
                    >
                      <GripIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="text-sm">{field.label}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="rounded border border-gray-200 p-3 dark:border-gray-700">
                <p className="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase dark:text-gray-500">
                  Form preview
                </p>
                <div className="mb-3">
                  <label className="mb-1 block text-sm font-medium">First Name *</label>
                  <input disabled className="bg-gray-50 dark:bg-gray-800" />
                </div>
                <div className="mb-3">
                  <label className="mb-1 block text-sm font-medium">Last Name *</label>
                  <input disabled className="bg-gray-50 dark:bg-gray-800" />
                </div>
                <div className="mb-3">
                  <label className="mb-1 block text-sm font-medium">Email *</label>
                  <input disabled className="bg-gray-50 dark:bg-gray-800" />
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
                      className={`mb-3 cursor-move rounded border border-gray-200 p-2 dark:border-gray-700 ${draggedKey === field.key ? 'opacity-50' : ''}`}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <GripIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <label className="flex-1 text-sm font-medium">
                          {field.label}
                          {requiredFields[field.key] ? ' *' : ''}
                        </label>
                        <label className="inline-flex items-center gap-1 text-xs font-normal text-gray-500">
                          <input
                            type="checkbox"
                            className="w-auto"
                            checked={Boolean(requiredFields[field.key])}
                            onChange={() => toggleFieldRequired(field.key)}
                          />
                          Required
                        </label>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => removeField(field.key)}
                          aria-label={`Remove ${field.label}`}
                          title="Remove"
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
                      : 'border-gray-300 text-gray-400 dark:border-gray-700 dark:text-gray-500'
                  }`}
                >
                  Drop here to add to the end
                </div>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="pf-thank-you">Thank you message</label>
            <textarea
              id="pf-thank-you"
              rows={3}
              value={thankYouMessage}
              onChange={(e) => setThankYouMessage(e.target.value)}
              placeholder="Thank you! Your submission has been received."
            />
            <p className="mt-1 text-xs text-gray-500">Shown after a successful submit. Leave blank to use the default above.</p>
          </div>
        </form>
      </SlideOver>

      <div className="page-toolbar no-border">
        <h2>Public Forms</h2>
      </div>
      <div className="views-bar">
        <button type="button" className={`view-tab ${tab === 'employee' ? 'active' : ''}`} onClick={() => setTab('employee')}>
          Employees
        </button>
        <button type="button" className={`view-tab ${tab === 'client' ? 'active' : ''}`} onClick={() => setTab('client')}>
          Clients
        </button>
        <button type="button" className="btn-outline btn-tab-size ml-auto" onClick={handleOpenCreate}>
          <PlusIcon className="h-3.5 w-3.5" />
          New Form
        </button>
      </div>

      <div className="mt-4">
        {loading && <p>Loading...</p>}
        {!loading && filteredForms.length === 0 && (
          <p>
            No public forms for {tab === 'employee' ? 'Employees' : 'Clients'} yet. Create one to let people apply
            without an admin creating them manually.
          </p>
        )}
        {!loading && filteredForms.length > 0 && (
          <div className="full-table-wrap">
            <table className="table full-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Link</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredForms.map((form) => (
                  <tr key={form.id} className={!form.isActive ? 'table-row-inactive' : ''}>
                    <td>{form.name}</td>
                    <td>
                      <button type="button" className="table-link" onClick={() => handleCopyLink(form)}>
                        Copy link
                      </button>
                    </td>
                    <td>{form.isActive ? 'Active' : 'Inactive'}</td>
                    <td className="flex gap-1.5">
                      <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => handleOpenEdit(form)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-secondary px-2 py-1 text-xs"
                        onClick={() => handleToggleActive(form)}
                      >
                        {form.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
