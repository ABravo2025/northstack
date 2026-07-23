import { useEffect, useRef, useState } from 'react';
import Popover from './Popover';

// Brand colors first, then a general-purpose set covering common
// category/tag colors (status dots, time off policies, etc.) — kept generic on
// purpose so this component works for any future feature that needs a
// color picker, not just the one it was built for.
const PRESET_COLORS = [
  '#0d2a48', // brand navy
  '#3c6da1', // brand blue
  '#8dbada', // brand blue light
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#a855f7', // purple
  '#6b7280', // gray
];

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
const CUSTOM_COLORS_STORAGE_KEY = 'northstack:customColors';
const MAX_CUSTOM_COLORS = 12;

// Custom colors saved from any picker are shared across the whole app (e.g.
// a color added while editing time off policies shows up later in Statuses too),
// same spirit as Google Sheets' "custom" row.
function loadCustomColors(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_COLORS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveCustomColor(hex: string): string[] {
  const existing = loadCustomColors().filter((c) => c.toLowerCase() !== hex.toLowerCase());
  const updated = [hex, ...existing].slice(0, MAX_CUSTOM_COLORS);
  localStorage.setItem(CUSTOM_COLORS_STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export default function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [customColors, setCustomColors] = useState<string[]>(() => loadCustomColors());
  const [draftHex, setDraftHex] = useState(value || '#3c6da1');
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setDraftHex(value || '#3c6da1');
  }, [value]);

  const isDraftValid = HEX_PATTERN.test(draftHex);
  const isDraftUnsaved = isDraftValid && draftHex.toLowerCase() !== value?.toLowerCase();

  const handleSaveDraft = () => {
    if (!isDraftValid) return;
    setCustomColors(saveCustomColor(draftHex));
    onChange(draftHex);
    setOpen(false);
  };

  return (
    <div className="color-picker">
      <button
        ref={triggerRef}
        type="button"
        className="color-swatch color-swatch-trigger"
        style={{ background: HEX_PATTERN.test(value) ? value : '#ffffff' }}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title={value}
        aria-label="Choose color"
      />
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} width={256}>
        <div onClick={(e) => e.stopPropagation()}>
          <div className="color-picker-section-label">Standard</div>
          <div className="color-picker-swatches">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`color-swatch ${value?.toLowerCase() === color.toLowerCase() ? 'color-swatch-selected' : ''}`}
                style={{ background: color }}
                onClick={() => {
                  onChange(color);
                  setOpen(false);
                }}
                title={color}
                aria-label={`Use color ${color}`}
              />
            ))}
          </div>

          {customColors.length > 0 && (
            <>
              <div className="color-picker-section-label">Custom</div>
              <div className="color-picker-swatches">
                {customColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`color-swatch ${value?.toLowerCase() === color.toLowerCase() ? 'color-swatch-selected' : ''}`}
                    style={{ background: color }}
                    onClick={() => {
                      onChange(color);
                      setOpen(false);
                    }}
                    title={color}
                    aria-label={`Use color ${color}`}
                  />
                ))}
              </div>
            </>
          )}

          <div className="color-picker-section-label">Add custom</div>
          <div className="color-picker-custom-row">
            <label
              className="color-swatch-preview"
              style={{ background: isDraftValid ? draftHex : '#ffffff' }}
            >
              <input
                type="color"
                value={isDraftValid ? draftHex : '#3c6da1'}
                onChange={(e) => setDraftHex(e.target.value)}
                aria-label="Pick a custom color"
              />
            </label>
            <input
              type="text"
              value={draftHex}
              onChange={(e) => setDraftHex(e.target.value)}
              placeholder="#3c6da1"
              maxLength={7}
              className="color-hex-input"
              aria-label="Custom color hex code"
            />
            <button
              type="button"
              className="btn-secondary px-2 py-1 text-xs"
              disabled={!isDraftUnsaved}
              onClick={handleSaveDraft}
            >
              Save
            </button>
          </div>
        </div>
      </Popover>
    </div>
  );
}
