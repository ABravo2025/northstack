import { useRef, useState } from 'react';
import Popover from '../common/Popover';
import { CalendarIcon, CheckIcon } from '../common/Icons';
import { DEFAULT_PRESET, PRESETS, presetLabel, rangeForPreset, toDateInputValue, type DateRange, type PresetKey } from '../../lib/dateRangePresets';

interface DateRangeFilterProps {
  presetKey: PresetKey;
  range: DateRange;
  onChange: (range: DateRange, presetKey: PresetKey) => void;
}

// Preset rows + a custom range tucked behind a hairline in the footer — same
// composition the dataviz skill's interaction spec calls for (list of
// presets, no calendar grid for "last 30 days"), built on this project's
// standard Popover mechanism instead of a new one.
export default function DateRangeFilter({ presetKey, range, onChange }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [customSince, setCustomSince] = useState(() => toDateInputValue(range.since));
  const [customUntil, setCustomUntil] = useState(() => toDateInputValue(range.until));

  const selectPreset = (key: Exclude<PresetKey, 'custom'>) => {
    onChange(rangeForPreset(key), key);
    setOpen(false);
  };

  const applyCustom = () => {
    if (!customSince || !customUntil) return;
    const since = new Date(customSince);
    const until = new Date(customUntil);
    until.setHours(23, 59, 59, 999);
    if (since > until) return;
    onChange({ since, until }, 'custom');
    setOpen(false);
  };

  return (
    <div className="popover-anchor">
      <button ref={anchorRef} type="button" className="btn border border-line-strong bg-surface-1 dark:border-dark-line dark:bg-dark-surface" onClick={() => setOpen((o) => !o)}>
        <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
        {presetKey === 'custom' ? `${toDateInputValue(range.since)} – ${toDateInputValue(range.until)}` : presetLabel(presetKey)}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} width={220}>
        <div className="flex flex-col">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-surface-2 dark:text-dark-ink dark:hover:bg-white/[0.06]"
              onClick={() => selectPreset(p.key)}
            >
              {p.label}
              {presetKey === p.key && <CheckIcon className="h-4 w-4 shrink-0 text-accent" />}
            </button>
          ))}
          <div className="mt-2 border-t border-line pt-2 dark:border-dark-line">
            <p className="mb-1.5 px-2 text-xs font-medium text-ink-faint dark:text-dark-ink-faint">Custom range</p>
            <div className="flex flex-col gap-1.5 px-2">
              <input
                type="date"
                value={customSince}
                onChange={(e) => setCustomSince(e.target.value)}
                className="rounded-md border border-line-strong bg-surface-1 px-2 py-1 text-sm dark:border-dark-line dark:bg-dark-surface dark:text-dark-ink"
              />
              <input
                type="date"
                value={customUntil}
                onChange={(e) => setCustomUntil(e.target.value)}
                className="rounded-md border border-line-strong bg-surface-1 px-2 py-1 text-sm dark:border-dark-line dark:bg-dark-surface dark:text-dark-ink"
              />
              <button type="button" className="btn btn-primary mt-1" onClick={applyCustom}>
                Apply
              </button>
            </div>
          </div>
        </div>
      </Popover>
    </div>
  );
}

export { DEFAULT_PRESET, rangeForPreset };
