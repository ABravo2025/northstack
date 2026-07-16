import { useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import Popover from './Popover';
import { DotsVerticalIcon } from './Icons';

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
}

export default function CustomFieldColumnMenu({ field, onUpdate, onDeactivate }: CustomFieldColumnMenuProps) {
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
          title="Delete field"
          message={`Delete "${field.name}"? Existing values stay in the database but the column disappears from the table. You can't undo this from here.`}
          confirmLabel="Delete"
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
        aria-label={`Manage ${field.name} field`}
      >
        <DotsVerticalIcon />
      </button>
      <Popover open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={triggerRef} width={editing ? 240 : 140}>
        {!editing ? (
          <>
            <div className="popover-menu-item" onClick={() => setEditing(true)}>
              Edit field
            </div>
            <div
              className="popover-menu-item danger"
              onClick={() => {
                setMenuOpen(false);
                setConfirmingDelete(true);
              }}
            >
              Delete field
            </div>
          </>
        ) : (
          <div onClick={(e) => e.stopPropagation()}>
            <div className="nv-field">
              <label htmlFor={`cf-edit-name-${field.id}`}>Field name</label>
              <input id={`cf-edit-name-${field.id}`} type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {field.fieldType === 'select' && (
              <div className="nv-field">
                <label htmlFor={`cf-edit-options-${field.id}`}>Options (comma-separated)</label>
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
              Required
            </label>
            <button type="button" className="btn-primary w-full text-center" onClick={handleSave}>
              Save
            </button>
          </div>
        )}
      </Popover>
    </>
  );
}
