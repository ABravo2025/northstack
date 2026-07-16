import { useRef, useState } from 'react';
import Popover from './Popover';
import { PlusIcon } from './Icons';

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
        aria-label="Add field"
      >
        <PlusIcon />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} width={240} align="right">
        <div className="nv-field">
          <label htmlFor="new-cf-name">Field name</label>
          <input
            id="new-cf-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Emergency Contact"
            autoFocus
          />
        </div>
        <div className="nv-field">
          <label htmlFor="new-cf-type">Type</label>
          <select id="new-cf-type" value={fieldType} onChange={(e) => setFieldType(e.target.value)}>
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="email">Email</option>
            <option value="select">Select (dropdown)</option>
          </select>
        </div>
        {fieldType === 'select' && (
          <div className="nv-field">
            <label htmlFor="new-cf-options">Options (comma-separated)</label>
            <input
              id="new-cf-options"
              type="text"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder="e.g. Small, Medium, Large"
            />
          </div>
        )}
        <label className="mb-2.5 flex items-center gap-1.5 text-xs font-normal">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Required
        </label>
        <button type="button" className="btn-primary w-full text-center" onClick={handleCreate}>
          Add field
        </button>
      </Popover>
    </>
  );
}
