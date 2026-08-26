import { useRef, useState } from 'react';
import Popover from './Popover';
import { ChevronDownIcon } from './Icons';

export interface MultiSelectOption {
  value: string;
  label: string;
  // Rendered greyed-out with a note, but still toggleable — e.g. an inactive
  // User can still be a round-robin participant, just permanently skipped
  // until they're active again (docs/tareas/specredisenosalesv2.md §3.8).
  note?: string;
}

interface MultiSelectDropdownProps {
  id?: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
  // While the caller's own fetch is still in flight, `options` is
  // indistinguishable from "confirmed empty" (both start as `[]`) — without
  // this, the popover shows emptyMessage prematurely, before the data that
  // would prove it wrong has even arrived (found visually testing this
  // 2026-08-26: opening the dropdown right after picking a Pipeline's
  // assignment mode showed "No users in this tenant yet." for an instant on
  // a tenant that already had one).
  loading?: boolean;
}

// Closed dropdown + checkbox list, built on the same Popover every other menu
// in the app uses (positioning/outside-click/Escape handling) — there's no
// existing multi-select component to reuse, checkboxes-in-place were the
// prior pattern (e.g. ColumnVisibilityMenu.tsx) but read as a permanent
// checklist rather than a compact field, which is what a form wants here.
export default function MultiSelectDropdown({
  id,
  options,
  selected,
  onChange,
  placeholder = 'Select…',
  emptyMessage = 'No options.',
  loading = false,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const selectedLabels = options.filter((o) => selected.includes(o.value)).map((o) => o.label);
  const summary =
    selectedLabels.length === 0 ? placeholder : selectedLabels.length <= 2 ? selectedLabels.join(', ') : `${selectedLabels.length} selected`;

  return (
    <div>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className="multi-select-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={selectedLabels.length === 0 ? 'text-ink-faint' : ''}>{summary}</span>
        <ChevronDownIcon className="h-4 w-4 text-ink-faint" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} width={260}>
        <div className="col-visibility-list" style={{ maxHeight: 220, overflowY: 'auto' }}>
          {loading ? (
            <p className="text-xs text-gray-500 px-2 py-1">Loading…</p>
          ) : options.length === 0 ? (
            <p className="text-xs text-gray-500 px-2 py-1">{emptyMessage}</p>
          ) : null}
          {!loading &&
            options.map((opt) => (
              <label className="col-visibility-row" key={opt.value}>
                <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} />
                <span>
                  {opt.label}
                  {opt.note && <span className="text-ink-faint"> {opt.note}</span>}
                </span>
              </label>
            ))}
        </div>
      </Popover>
    </div>
  );
}
