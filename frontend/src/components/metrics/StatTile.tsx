interface StatTileProps {
  label: string;
  value: string;
  subtitle?: string;
}

// Long values (e.g. several currencies "USD 12,400 + ARS 3.500.000") step the font down and wrap
// inside the tile instead of spilling out of it (client report, 2026-10-03).
function valueSize(value: string): string {
  if (value.length > 22) return 'text-base';
  if (value.length > 14) return 'text-lg';
  return 'text-2xl';
}

// Shared "single number" tile — used by the /overview general strip and every
// /dashboards category page's headline row, so the two surfaces read as one
// system instead of two different visual languages. Label and value centered.
export default function StatTile({ label, value, subtitle }: StatTileProps) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface-1 p-4 text-center dark:border-dark-line dark:bg-dark-surface">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint [overflow-wrap:anywhere]">{label}</p>
      <p
        className={`mt-1 ${valueSize(value)} font-semibold leading-tight text-ink dark:text-dark-ink [overflow-wrap:anywhere]`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </p>
      {subtitle && <p className="mt-0.5 text-xs text-ink-muted dark:text-dark-ink-muted [overflow-wrap:anywhere]">{subtitle}</p>}
    </div>
  );
}
