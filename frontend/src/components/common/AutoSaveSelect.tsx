import { useEffect, useState } from 'react';
import { useToast } from './ToastProvider';

interface AutoSaveSelectProps {
  value: string;
  onSave: (value: string) => Promise<unknown>;
  options: { value: string; label: string }[];
  emptyLabel?: string;
  label: string;
}

// A <select> commits immediately on change (no blur ambiguity like text
// inputs) — reverts on failure, same contract as AutoSaveField.
export default function AutoSaveSelect({ value, onSave, options, emptyLabel = '-- none --', label }: AutoSaveSelectProps) {
  const toast = useToast();
  const [current, setCurrent] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCurrent(value);
  }, [value]);

  const handleChange = async (next: string) => {
    const previous = current;
    setCurrent(next);
    setSaving(true);
    try {
      await onSave(next);
    } catch (error) {
      setCurrent(previous);
      toast.error(`Failed to update ${label.toLowerCase()}: ` + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <select
      className="overview-field-input"
      value={current}
      disabled={saving}
      onChange={(e) => handleChange(e.target.value)}
      aria-label={label}
    >
      <option value="">{emptyLabel}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
