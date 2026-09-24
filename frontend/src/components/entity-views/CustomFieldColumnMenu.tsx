import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ConfirmDialog from '../common/ConfirmDialog';
import Popover from '../common/Popover';
import RequiredMark from '../common/RequiredMark';
import { DotsVerticalIcon } from '../common/Icons';

interface CustomFieldLike {
  id: string;
  name: string;
  fieldType: string;
  options: string | null;
  required: boolean;
}

interface CustomFieldColumnMenuProps {
  field: CustomFieldLike;
  onUpdate: (id: string, data: { name?: string; required?: boolean; options?: string }) => Promise<void>;
  onDeactivate: (id: string) => Promise<void>;
  onHide?: () => void;
}

export default function CustomFieldColumnMenu({ field, onUpdate, onDeactivate, onHide }: CustomFieldColumnMenuProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [name, setName] = useState(field.name);
  const [required, setRequired] = useState(field.required);
  const [optionsText, setOptionsText] = useState((JSON.parse(field.options || '[]') as string[]).join(', '));

  const triggerRef = useRef<HTMLButtonElement>(null);

  const openMenu = () => {
    setEditing(false);
    setName(field.name);
    setRequired(field.required);
    setOptionsText((JSON.parse(field.options || '[]') as string[]).join(', '));
    setMenuOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    const data: { name?: string; required?: boolean; options?: string } = {
      name: name.trim(),
      required,
    };
    if (field.fieldType === 'select') {
      data.options = JSON.stringify(
        optionsText
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      );
    }
    await onUpdate(field.id, data);
    setMenuOpen(false);
  };

  return (
    <>
      {confirmingDelete && (
        <ConfirmDialog
          title={t('entityViews.customField.deleteFieldTitle')}
          message={t('entityViews.customField.deleteFieldMessage', { name: field.name })}
          confirmLabel={t('entityViews.views.delete')}
          onConfirm={async () => {
            await onDeactivate(field.id);
            setConfirmingDelete(false);
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
      <button
        ref={triggerRef}
        type="button"
        className="col-menu-trigger"
        onClick={(e) => {
          e.stopPropagation();
          openMenu();
        }}
        aria-label={t('entityViews.customField.manageAriaLabel', { name: field.name })}
      >
        <DotsVerticalIcon />
      </button>
      <Popover open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={triggerRef} width={editing ? 240 : 140}>
        {!editing ? (
          <>
            <div className="popover-menu-item" onClick={() => setEditing(true)}>
              {t('entityViews.customField.editField')}
            </div>
            {onHide && (
              <div
                className="popover-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onHide();
                }}
              >
                {t('entityViews.customField.hideColumn')}
              </div>
            )}
            <div
              className="popover-menu-item danger"
              onClick={() => {
                setMenuOpen(false);
                setConfirmingDelete(true);
              }}
            >
              {t('entityViews.customField.deleteField')}
            </div>
          </>
        ) : (
          <div onClick={(e) => e.stopPropagation()}>
            <div className="nv-field">
              <label htmlFor={`cf-edit-name-${field.id}`}>
                {t('entityViews.customField.fieldNameLabel')}
                <RequiredMark />
              </label>
              <input
                id={`cf-edit-name-${field.id}`}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            {field.fieldType === 'select' && (
              <div className="nv-field">
                <label htmlFor={`cf-edit-options-${field.id}`}>{t('entityViews.customField.optionsLabel')}</label>
                <input
                  id={`cf-edit-options-${field.id}`}
                  type="text"
                  value={optionsText}
                  onChange={(e) => setOptionsText(e.target.value)}
                />
              </div>
            )}
            <label className="mb-2.5 flex items-center gap-1.5 text-xs font-normal">
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
              {t('entityViews.customField.required')}
            </label>
            <button type="button" className="btn-primary w-full text-center" onClick={handleSave}>
              {t('entityViews.customField.save')}
            </button>
          </div>
        )}
      </Popover>
    </>
  );
}
