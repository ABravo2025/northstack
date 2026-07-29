const PALETTE = ['purple', 'coral', 'pink', 'teal'] as const;

function pickColor(seed: string): (typeof PALETTE)[number] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

interface CategoryChipProps {
  label: string;
  /** Stable identifier to hash for color (e.g. a catalog id) — falls back to `label` so
   *  a rename still gets a consistent color when no id is available. */
  seed?: string;
}

export default function CategoryChip({ label, seed }: CategoryChipProps) {
  const color = pickColor(seed ?? label);
  return <span className={`category-chip chip-${color}`}>{label}</span>;
}
