import { useEffect, useState } from 'react';
import { useToast } from './ToastProvider';

interface AutoSaveFieldProps {
  value: string;
  onSave: (value: string) => Promise<unknown>;
  type?: 'text' | 'date' | 'number' | 'url' | 'email';
  placeholder?: string;
  label: string;
}

// Commits on blur (not on every keystroke) — reverts to the last-saved value
// and toasts on failure, so a rejected PATCH never leaves the field showing
// something the server didn't actually accept.
export default function AutoSaveField({ value, onSave, type = 'text', placeholder, label }: AutoSaveFieldProps) {
  const toast = useToast();
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = async () => {
    if (draft === value) return;
    setSaving(true);
    try {
      await onSave(draft);
    } catch (error) {
      setDraft(value);
      toast.error(`Failed to update ${label.toLowerCase()}: ` + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <input
      className="overview-field-input"
      type={type}
      value={draft}
      placeholder={placeholder}
      disabled={saving}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(value);
      }}
      aria-label={label}
    />
  );
}
