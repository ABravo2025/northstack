import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Popover from '../common/Popover';
import RequiredMark from '../common/RequiredMark';
import { PlusIcon } from '../common/Icons';

interface NewFieldInput {
  name: string;
  fieldType: string;
  options?: string;
  required: boolean;
}

interface AddCustomFieldColumnProps {
  onCreate: (input: NewFieldInput) => Promise<void>;
}

export default function AddCustomFieldColumn({ onCreate }: AddCustomFieldColumnProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [fieldType, setFieldType] = useState('text');
  const [optionsText, setOptionsText] = useState('');
  const [required, setRequired] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const reset = () => {
    setName('');
    setFieldType('text');
    setOptionsText('');
    setRequired(false);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    await onCreate({
      name: name.trim(),
      fieldType,
      options:
        fieldType === 'select'
          ? JSON.stringify(
              optionsText
                .split(',')
                .map((o) => o.trim())
                .filter(Boolean),
            )
          : undefined,
      required,
    });
    setOpen(false);
    reset();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="col-add-trigger"
        onClick={() => {
          reset();
          setOpen((v) => !v);
        }}
        aria-label={t('entityViews.customField.addFieldAriaLabel')}
      >
        <PlusIcon />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} width={240} align="right">
        <div className="nv-field">
          <label htmlFor="new-cf-name">
            {t('entityViews.customField.fieldNameLabel')}
            <RequiredMark />
          </label>
          <input
            id="new-cf-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('entityViews.customField.addFieldNamePlaceholder')}
            autoFocus
            required
          />
        </div>
        <div className="nv-field">
          <label htmlFor="new-cf-type">{t('entityViews.customField.typeLabel')}</label>
          <select id="new-cf-type" value={fieldType} onChange={(e) => setFieldType(e.target.value)}>
            <option value="text">{t('entityViews.customField.typeText')}</option>
            <option value="number">{t('entityViews.customField.typeNumber')}</option>
            <option value="date">{t('entityViews.customField.typeDate')}</option>
            <option value="email">{t('entityViews.customField.typeEmail')}</option>
            <option value="select">{t('entityViews.customField.typeSelect')}</option>
          </select>
        </div>
        {fieldType === 'select' && (
          <div className="nv-field">
            <label htmlFor="new-cf-options">{t('entityViews.customField.optionsLabel')}</label>
            <input
              id="new-cf-options"
              type="text"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder={t('entityViews.customField.optionsPlaceholder')}
            />
          </div>
        )}
        <label className="mb-2.5 flex items-center gap-1.5 text-xs font-normal">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          {t('entityViews.customField.required')}
        </label>
        <button type="button" className="btn-primary w-full text-center" onClick={handleCreate}>
          {t('entityViews.customField.addField')}
        </button>
      </Popover>
    </>
  );
}
