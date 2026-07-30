import { useMemo, useRef, useState } from 'react';
import Popover from './Popover';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  id?: string;
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// Text input + filtered dropdown, for picking one option out of a list too
// long to scan as a plain <select> (e.g. every Company in the tenant). Built
// on the existing Popover for positioning/outside-click/Escape handling
// rather than reimplementing that.
export default function SearchableSelect({ id, options, value, onChange, placeholder }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const anchorRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const handleSelect = (opt: SearchableSelectOption) => {
    onChange(opt.value);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={anchorRef}>
      <input
        id={id}
        type="text"
        value={open ? query : selected?.label ?? ''}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        placeholder={placeholder ?? 'Search…'}
        autoComplete="off"
      />
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} width={280}>
        <div className="status-manage-list">
          {filtered.length === 0 && <p className="text-xs text-gray-500 px-2 py-1">No matches.</p>}
          {filtered.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="popover-menu-item w-full text-left"
              onClick={() => handleSelect(opt)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}
